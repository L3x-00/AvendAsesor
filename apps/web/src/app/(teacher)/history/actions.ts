"use server";

import { unstable_rethrow } from "next/navigation";
import { createAuthorizedChatApiClient } from "@/lib/chat-api/authorized-client";
import { ChatApiError } from "@/lib/chat-api/client";

/**
 * Resultado de quitar una conversación del historial propio.
 *
 * - `removed`: el API la quitó ahora.
 * - `already-removed`: ya no estaba (p. ej. se quitó desde otro dispositivo);
 *   para la persona el resultado es el mismo, así que no se le pide recargar.
 * - `error`: no se quitó; `message` es el texto que se le muestra.
 *
 * La acción NO llama a `revalidatePath`: dentro de la respuesta de la Server
 * Action forzaba un nuevo render completo desde la raíz, con más peticiones al
 * API. La lista se actualiza en el cliente (retirada inmediata) y con una sola
 * recarga de la ruta.
 *
 * Sobre la pantalla «No pudimos cargar esta sección» tras un borrado: no la
 * causaba un cursor «inválido» (la paginación es por clave `(updated_at, id)` y
 * tolera que la fila del cursor ya no exista). La causa fue el limitador de
 * peticiones del API (se corrige allí): la recarga posterior al borrado recibía
 * un 429 y la página lo lanzaba al límite de error. Ahora la página muestra un
 * aviso en línea en vez de lanzar, y esta acción nunca rechaza por un error
 * del API.
 */
export type DeleteConversationResult =
  | { status: "already-removed" }
  | { status: "removed" }
  | { message: string; status: "error" };

// Cualquier versión de UUID (el seed de demostración usa v5). Evita además
// que un valor manipulado altere la ruta que se llama en el API.
const CONVERSATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function deleteConversationAction(
  conversationId: unknown,
): Promise<DeleteConversationResult> {
  if (typeof conversationId !== "string" || !CONVERSATION_ID.test(conversationId)) {
    return {
      message: "No encontramos esta consulta. Actualizamos tu historial.",
      status: "error",
    };
  }

  // Fuera del try: si la sesión caducó o el acceso fue revocado, esta llamada
  // redirige (al inicio de sesión o a /access-denied) y no debe convertirse en
  // un «inténtalo nuevamente».
  const client = await createAuthorizedChatApiClient();

  try {
    await client.deleteConversation(conversationId);
    return { status: "removed" };
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof ChatApiError && error.status === 404) {
      return { status: "already-removed" };
    }

    if (error instanceof ChatApiError && error.status === 403) {
      return {
        message: "No tienes permiso para quitar esta consulta.",
        status: "error",
      };
    }

    return {
      message:
        "No pudimos quitar esta consulta en este momento. Inténtalo de nuevo en unos segundos.",
      status: "error",
    };
  }
}
