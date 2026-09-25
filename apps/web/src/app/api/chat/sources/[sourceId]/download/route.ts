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
/** Página citada (el chunking acota los documentos a 300 páginas). */
const pageSchema = z.coerce.number().int().min(1).max(300);

const FRIENDLY_MESSAGES: Record<number, string> = {
  401: "Tu sesión expiró. Vuelve a iniciar sesión y abre el documento desde la conversación.",
  403: "No tienes permiso para abrir este documento.",
  404: "Este documento ya no está disponible. Puede que haya sido retirado o reemplazado.",
};

/**
 * «Ver documento» se abre en una pestaña nueva: ante un error, una página en
 * lenguaje llano en lugar de un JSON con un código técnico. Los clientes que no
 * piden HTML siguen recibiendo el código.
 */
function safeError(status: number, request: Request): NextResponse {
  const headers = { "Cache-Control": "no-store" };
  if (request.headers.get("accept")?.includes("text/html")) {
    const message =
      FRIENDLY_MESSAGES[status] ??
      "No pudimos abrir este documento en este momento. Inténtalo nuevamente en unos minutos.";
    return new NextResponse(
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Documento no disponible · AVEND ASESOR</title></head><body style="font-family: system-ui, sans-serif; font-size: 18px; line-height: 1.6; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; color: #0d1b3d;"><h1 style="font-size: 1.5rem;">No pudimos abrir el documento</h1><p>${message}</p><p>Puedes cerrar esta pestaña y volver a tu conversación.</p></body></html>`,
      {
        headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
        status,
      },
    );
  }
  return NextResponse.json(
    { error: status === 404 ? "SOURCE_NOT_AVAILABLE" : "SOURCE_UNAVAILABLE" },
    { headers, status },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
): Promise<Response> {
  const session = await resolveAuthorizedChatSession();
  if ("status" in session) {
    return safeError(session.status === "unauthenticated" ? 401 : 403, request);
  }

  const parsedSourceId = sourceIdSchema.safeParse((await params).sourceId);
  if (!parsedSourceId.success) return safeError(404, request);
  const page = pageSchema.safeParse(
    new URL(request.url).searchParams.get("pagina") ?? undefined,
  );

  try {
    const source = await new ChatApiClient(
      session.accessToken,
    ).getSourceDownloadUrl(parsedSourceId.data);

    if (source.sourceId !== parsedSourceId.data) return safeError(502, request);

    // El visor de PDF del navegador abre directamente la página citada.
    const location = page.success
      ? `${source.url}#page=${page.data}`
      : source.url;
    const response = NextResponse.redirect(location, 307);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch (error) {
    if (error instanceof ChatApiError) {
      if (error.status === 401) return safeError(401, request);
      if (error.status === 403 || error.status === 404) {
        return safeError(404, request);
      }
      return safeError(502, request);
    }
    if (error instanceof ChatApiResponseError) return safeError(502, request);
    return safeError(503, request);
  }
}
