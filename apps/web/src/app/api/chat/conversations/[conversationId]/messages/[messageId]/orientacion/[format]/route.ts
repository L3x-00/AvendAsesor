import { NextResponse } from "next/server";
import { hasTrustedRequestOrigin } from "@/lib/auth/site-url";
import { resolveAuthorizedChatSession } from "@/lib/chat-api/authorized-client";
import {
  ChatApiClient,
  ChatApiError,
  ChatApiResponseError,
} from "@/lib/chat-api/client";
import {
  buildOrientationDocx,
  buildOrientationPdf,
} from "@/lib/orientation-document/builders";
import {
  contentDisposition,
  createOrientationDocumentContent,
  orientationPresentationSchema,
  orientationRouteParamsSchema,
  resolveOrientationContext,
  sanitizeFileBaseName,
} from "@/lib/orientation-document/model";
import type { ChatConversationDetail } from "@/lib/chat-api/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIME_BY_FORMAT = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
} as const;
const MAX_PRESENTATION_BODY_BYTES = 25_000;

function safeError(error: string, status: number): NextResponse {
  return NextResponse.json(
    { error },
    { headers: { "Cache-Control": "no-store" }, status },
  );
}

async function readBoundedBody(
  request: Request,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      byteLength += value.byteLength;
      // Abandon the oversized body without cancelling the reader: cancelling a
      // still-producing source races with its pending enqueue and surfaces as
      // an unhandled rejection. Releasing the lock lets the request be discarded.
      if (byteLength > MAX_PRESENTATION_BODY_BYTES) return null;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      conversationId: string;
      format: string;
      messageId: string;
    }>;
  },
): Promise<Response> {
  if (!hasTrustedRequestOrigin(request.headers.get("origin"))) {
    return safeError("FORBIDDEN", 403);
  }

  const session = await resolveAuthorizedChatSession();
  if ("status" in session) {
    return safeError(
      session.status === "unauthenticated" ? "UNAUTHENTICATED" : "FORBIDDEN",
      session.status === "unauthenticated" ? 401 : 403,
    );
  }

  const parsedParams = orientationRouteParamsSchema.safeParse(await params);
  if (!parsedParams.success || !parsedParams.data.format) {
    return safeError("INVALID_REQUEST", 400);
  }

  const rawContentLength = request.headers.get("content-length");
  if (
    rawContentLength &&
    (!/^\d+$/.test(rawContentLength) ||
      Number(rawContentLength) > MAX_PRESENTATION_BODY_BYTES)
  ) {
    return safeError("INVALID_REQUEST", 413);
  }

  const boundedBody = await readBoundedBody(request);
  if (!boundedBody) return safeError("INVALID_REQUEST", 413);

  let formData: FormData;
  try {
    const boundedRequest = new Request(request.url, {
      body: boundedBody.byteLength > 0 ? boundedBody : undefined,
      headers: request.headers,
      method: "POST",
    });
    formData = await boundedRequest.formData();
  } catch {
    return safeError("INVALID_REQUEST", 400);
  }

  const parsedPresentation = orientationPresentationSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsedPresentation.success) return safeError("INVALID_REQUEST", 400);

  const { conversationId, format, messageId } = parsedParams.data;
  let detail: ChatConversationDetail;
  try {
    detail = await new ChatApiClient(session.accessToken).getConversation(
      conversationId,
    );
  } catch (error) {
    if (error instanceof ChatApiError) {
      if (error.status === 401) return safeError("UNAUTHENTICATED", 401);
      if (error.status === 403 || error.status === 404) {
        return safeError("ORIENTATION_NOT_AVAILABLE", 404);
      }
      return safeError("ORIENTATION_UNAVAILABLE", 502);
    }
    if (error instanceof ChatApiResponseError) {
      return safeError("ORIENTATION_UNAVAILABLE", 502);
    }
    return safeError("ORIENTATION_UNAVAILABLE", 503);
  }

  const context = resolveOrientationContext(detail, conversationId, messageId);
  if (!context) return safeError("ORIENTATION_NOT_AVAILABLE", 404);

  const content = createOrientationDocumentContent(
    context,
    parsedPresentation.data,
  );
  let binary: Buffer;
  try {
    binary =
      format === "docx"
        ? await buildOrientationDocx(content)
        : await buildOrientationPdf(content);
  } catch {
    return safeError("DOCUMENT_GENERATION_FAILED", 500);
  }

  const fileName = `${sanitizeFileBaseName(content.documentTitle)}.${format}`;

  return new Response(new Uint8Array(binary), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": contentDisposition(fileName),
      "Content-Length": String(binary.byteLength),
      "Content-Type": MIME_BY_FORMAT[format],
      "X-Content-Type-Options": "nosniff",
    },
    status: 200,
  });
}
