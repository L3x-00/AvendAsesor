import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminApiUrl } from "@/lib/admin-api/config";
import { hasTrustedRequestOrigin } from "@/lib/auth/site-url";
import { resolveAuthorizedChatSession } from "@/lib/chat-api/authorized-client";
import {
  ConsultationFeedbackUploadError,
  optionalConsultationFeedbackFile,
  readConsultationFeedbackFormData,
} from "@/lib/chat-api/consultation-feedback-upload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const reportSchema = z.object({
  answerMessageId: z.string().uuid(),
  comment: z.string().trim().max(2000).optional(),
  reason: z.enum([
    "answer_not_relevant",
    "information_outdated",
    "citation_does_not_support",
    "missing_information",
    "answer_unclear",
    "other",
  ]),
  submissionId: z.string().uuid(),
});

function safeStatus(status: number): number {
  return [400, 401, 403, 413, 429, 503].includes(status) ? status : 503;
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!hasTrustedRequestOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const session = await resolveAuthorizedChatSession();
  if ("status" in session) {
    return NextResponse.json(
      {
        error:
          session.status === "unauthenticated"
            ? "UNAUTHENTICATED"
            : "FORBIDDEN",
      },
      { status: session.status === "unauthenticated" ? 401 : 403 },
    );
  }

  let form: FormData;
  try {
    form = await readConsultationFeedbackFormData(request);
  } catch (error) {
    if (
      error instanceof ConsultationFeedbackUploadError &&
      error.kind === "too_large"
    ) {
      return NextResponse.json({ error: "REQUEST_TOO_LARGE" }, { status: 413 });
    }
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const parsed = reportSchema.safeParse({
    answerMessageId: form.get("answerMessageId"),
    comment: form.get("comment") || undefined,
    reason: form.get("reason"),
    submissionId: form.get("submissionId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const upstreamForm = new FormData();
  upstreamForm.set("answerMessageId", parsed.data.answerMessageId);
  upstreamForm.set("reason", parsed.data.reason);
  upstreamForm.set("submissionId", parsed.data.submissionId);
  if (parsed.data.comment) upstreamForm.set("comment", parsed.data.comment);
  let file: File | null;
  try {
    file = optionalConsultationFeedbackFile(form.get("file"), [
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ConsultationFeedbackUploadError &&
          error.kind === "too_large"
            ? "REQUEST_TOO_LARGE"
            : "INVALID_REQUEST",
      },
      {
        status:
          error instanceof ConsultationFeedbackUploadError &&
          error.kind === "too_large"
            ? 413
            : 400,
      },
    );
  }
  if (file) upstreamForm.set("file", file);

  try {
    const upstream = await fetch(
      `${getAdminApiUrl()}/consultation-cases/reports`,
      {
        body: upstreamForm,
        cache: "no-store",
        credentials: "omit",
        headers: { Authorization: `Bearer ${session.accessToken}` },
        method: "POST",
        signal: request.signal,
      },
    );
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "REPORT_NOT_SAVED" },
        { status: safeStatus(upstream.status) },
      );
    }
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "REPORT_UNAVAILABLE" }, { status: 503 });
  }
}
