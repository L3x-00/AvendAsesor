"use server";

import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";
import type { DocumentLibraryPage } from "@/lib/admin-api/types";

/** Filas que muestra cada módulo abierto en el Historial. */
const HISTORY_PREVIEW_LIMIT = 3;

/** UUID v4 en texto: la entrada viene del cliente y no se usa sin validar. */
const MODULE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type HistoryModulePageResult =
  | { page: DocumentLibraryPage; status: "ok" }
  | { status: "error" };

/**
 * Documentos del módulo que el administrador abre en el Historial.
 *
 * La vista general entrega el primer módulo ya consultado desde el servidor.
 * Los demás se piden aquí, de a uno y solo cuando hacen falta, para que abrir
 * un módulo no repita la consulta completa ni recargue la página. El error se
 * devuelve como dato en lugar de lanzarse, así el carril de módulos sigue
 * usable y la vista puede ofrecer reintentar.
 */
export async function loadHistoryModulePage(
  moduleId: string,
): Promise<HistoryModulePageResult> {
  if (!MODULE_ID_PATTERN.test(moduleId)) {
    return { status: "error" };
  }

  try {
    const { client } = await createAuthorizedAdminApiContext({
      requireModulesAccess: true,
    });
    const page = await client.listDocumentLibrary({
      limit: HISTORY_PREVIEW_LIMIT,
      moduleId,
      offset: 0,
      sort: "newest",
    });

    return { page, status: "ok" };
  } catch {
    return { status: "error" };
  }
}
