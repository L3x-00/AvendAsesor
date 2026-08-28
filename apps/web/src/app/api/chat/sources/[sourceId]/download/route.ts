import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthorizedChatSession } from "@/lib/chat-api/authorized-client";
import {
  ChatApiClient,
  ChatApiError,
  ChatApiResponseError,
} from "@/lib/chat-api/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const sourceIdSchema = z.string().uuid();

function safeError(status: number): NextResponse {
  return NextResponse.json(
    { error: status === 404 ? "SOURCE_NOT_AVAILABLE" : "SOURCE_UNAVAILABLE" },
    {
      headers: { "Cache-Control": "no-store" },
      status,
    },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
): Promise<Response> {
  const session = await resolveAuthorizedChatSession();
  if ("status" in session) {
    return safeError(session.status === "unauthenticated" ? 401 : 403);
  }

  const parsedSourceId = sourceIdSchema.safeParse((await params).sourceId);
  if (!parsedSourceId.success) return safeError(404);

  try {
    const source = await new ChatApiClient(
      session.accessToken,
    ).getSourceDownloadUrl(parsedSourceId.data);

    if (source.sourceId !== parsedSourceId.data) return safeError(502);

    const response = NextResponse.redirect(source.url, 307);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch (error) {
    if (error instanceof ChatApiError) {
      if (error.status === 401) return safeError(401);
      if (error.status === 403 || error.status === 404) return safeError(404);
      return safeError(502);
    }
    if (error instanceof ChatApiResponseError) return safeError(502);
    return safeError(503);
  }
}
