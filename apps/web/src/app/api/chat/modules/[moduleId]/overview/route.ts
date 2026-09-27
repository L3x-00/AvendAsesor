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

const moduleIdSchema = z.string().uuid();

function failure(error: string, status: number): NextResponse {
  return NextResponse.json(
    { error },
    { headers: { "Cache-Control": "no-store" }, status },
  );
}

/** Panorama del tema abierto en el chat (documentos y resumen corto). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ moduleId: string }> },
): Promise<Response> {
  const session = await resolveAuthorizedChatSession();
  if ("status" in session) {
    return session.status === "unauthenticated"
      ? failure("UNAUTHENTICATED", 401)
      : failure("FORBIDDEN", 403);
  }

  const moduleId = moduleIdSchema.safeParse((await params).moduleId);
  if (!moduleId.success) return failure("MODULE_NOT_FOUND", 404);

  try {
    const overview = await new ChatApiClient(
      session.accessToken,
    ).getModuleOverview(moduleId.data);
    return NextResponse.json(overview, {
      headers: { "Cache-Control": "private, max-age=120" },
    });
  } catch (error) {
    if (error instanceof ChatApiError) {
      if (error.status === 401) return failure("UNAUTHENTICATED", 401);
      if (error.status === 403) return failure("FORBIDDEN", 403);
      if (error.status === 404) return failure("MODULE_NOT_FOUND", 404);
      return failure("OVERVIEW_UNAVAILABLE", 502);
    }
    if (error instanceof ChatApiResponseError) {
      return failure("OVERVIEW_UNAVAILABLE", 502);
    }
    return failure("OVERVIEW_UNAVAILABLE", 503);
  }
}
