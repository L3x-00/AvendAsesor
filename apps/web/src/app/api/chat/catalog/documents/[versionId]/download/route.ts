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

const versionIdSchema = z.string().uuid();

function safeError(status: number, request: Request): NextResponse {
  const headers = { "Cache-Control": "no-store" };
  if (request.headers.get("accept")?.includes("text/html")) {
    const message =
      status === 401
        ? "Tu sesión expiró. Vuelve a iniciar sesión y solicita el archivo otra vez."
        : status === 404
          ? "Este archivo ya no está disponible en el catálogo."
          : "No pudimos descargar este archivo en este momento. Inténtalo nuevamente en unos minutos.";
    return new NextResponse(
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Archivo no disponible · AVEND ASESOR</title></head><body style="font-family: system-ui, sans-serif; font-size: 18px; line-height: 1.6; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; color: #0d1b3d;"><h1 style="font-size: 1.5rem;">No pudimos descargar el archivo</h1><p>${message}</p><p>Puedes cerrar esta pestaña y volver al chat.</p></body></html>`,
      {
        headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
        status,
      },
    );
  }
  return NextResponse.json(
    {
      error: status === 404 ? "DOCUMENT_NOT_AVAILABLE" : "DOCUMENT_UNAVAILABLE",
    },
    { headers, status },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
): Promise<Response> {
  const session = await resolveAuthorizedChatSession();
  if ("status" in session) {
    return safeError(session.status === "unauthenticated" ? 401 : 403, request);
  }

  const versionId = versionIdSchema.safeParse((await params).versionId);
  if (!versionId.success) return safeError(404, request);

  try {
    const document = await new ChatApiClient(
      session.accessToken,
    ).getCatalogDocumentDownloadUrl(versionId.data);
    if (document.versionId !== versionId.data) return safeError(502, request);

    const response = NextResponse.redirect(document.url, 307);
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
