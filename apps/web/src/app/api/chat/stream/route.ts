import { NextRequest, NextResponse } from "next/server";
import { getAdminApiUrl } from "@/lib/admin-api/config";
import { resolveAuthorizedChatSession } from "@/lib/chat-api/authorized-client";
import { chatRequestSchema } from "@/lib/chat-api/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAFE_ERROR_BY_STATUS: Record<number, string> = {
  400: "La consulta no es válida.",
  401: "Tu sesión expiró. Inicia sesión nuevamente.",
  403: "No tienes permiso para realizar esta consulta.",
  429: "Se alcanzó el límite de consultas. Inténtalo nuevamente en un minuto.",
  503: "El servicio de consulta no está disponible por el momento.",
};

export async function POST(request: NextRequest): Promise<Response> {
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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${getAdminApiUrl()}/chat/stream`, {
      body: JSON.stringify(parsed.data),
      cache: "no-store",
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: request.signal,
    });
  } catch {
    return NextResponse.json({ error: "CHAT_UNAVAILABLE" }, { status: 503 });
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      {
        error:
          SAFE_ERROR_BY_STATUS[upstream.status] ??
          "No fue posible procesar la consulta.",
      },
      { status: upstream.status >= 400 ? upstream.status : 503 },
    );
  }

  return new Response(upstream.body, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
    status: upstream.status,
  });
}
