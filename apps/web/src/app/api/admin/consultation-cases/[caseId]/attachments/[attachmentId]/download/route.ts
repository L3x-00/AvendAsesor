import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthorizedConsultationReportsApiContext } from "@/lib/consultation-reports-api/authorized-client";
import {
  ConsultationReportsApiError,
  ConsultationReportsApiResponseError,
} from "@/lib/consultation-reports-api/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const uuid = z.string().uuid();

function safeError(status: number): NextResponse {
  return NextResponse.json(
    {
      error:
        status === 404 ? "ATTACHMENT_NOT_AVAILABLE" : "ATTACHMENT_UNAVAILABLE",
    },
    {
      headers: { "Cache-Control": "no-store" },
      status,
    },
  );
}

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ attachmentId: string; caseId: string }>;
  },
): Promise<Response> {
  const route = await params;
  const caseId = uuid.safeParse(route.caseId);
  const attachmentId = uuid.safeParse(route.attachmentId);
  if (!caseId.success || !attachmentId.success) return safeError(404);
  const mode = z
    .enum(["view", "download"])
    .safeParse(new URL(request.url).searchParams.get("mode") ?? "download");
  if (!mode.success) return safeError(400);

  const { client } = await createAuthorizedConsultationReportsApiContext();
  try {
    const target = await client.getAttachmentDownloadUrl(
      caseId.data,
      attachmentId.data,
      mode.data,
    );
    const response = NextResponse.redirect(target.url, 307);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch (error) {
    if (error instanceof ConsultationReportsApiError) {
      if (error.status === 401) return safeError(401);
      if (error.status === 403 || error.status === 404) return safeError(404);
      return safeError(502);
    }
    if (error instanceof ConsultationReportsApiResponseError)
      return safeError(502);
    return safeError(503);
  }
}
