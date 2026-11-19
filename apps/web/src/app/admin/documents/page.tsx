import { redirect } from "next/navigation";
import { AdminPage } from "@/components/admin/admin-page";
import { DocumentLibraryView } from "@/components/admin/document-library-view";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";
import {
  countDocumentLibraryFilters,
  documentLibraryHref,
  parseDocumentLibraryQuery,
  type DocumentLibrarySearchParams,
  type ParsedDocumentLibraryQuery,
} from "@/lib/admin-api/document-library-query";
import type {
  DocumentLibraryPage,
  ManagedModuleSummary,
} from "@/lib/admin-api/types";

/** Filas visibles del módulo abierto en la vista agrupada del Historial. */
const HISTORY_PREVIEW_LIMIT = 3;

/**
 * El Historial agrupa por módulo solo cuando no hay una búsqueda o filtro de
 * contenido: con filtros activos los resultados deben poder cruzar módulos, así
 * que se conserva la consulta plana. Elegir un módulo no cuenta como filtro de
 * contenido.
 */
function hasContentFilters(query: ParsedDocumentLibraryQuery): boolean {
  return Boolean(
    query.q ||
    query.issuanceYear !== undefined ||
    query.documentType ||
    query.issuingEntity ||
    query.situation ||
    query.technicalStatus ||
    query.createdBy ||
    query.createdFrom ||
    query.createdTo ||
    query.submoduleId ||
    query.page > 1,
  );
}

/**
 * Cuando la URL no elige módulo se abre el primero que tenga documentos: abrir
 * uno vacío por defecto haría parecer vacío todo el Historial. La misma regla
 * usa la vista para marcar la tarjeta activa.
 */
function resolveHistoryModuleId(
  rootModules: ManagedModuleSummary[],
  requested: string | undefined,
): string | undefined {
  if (requested && rootModules.some((module) => module.id === requested)) {
    return requested;
  }
  return (
    rootModules.find((module) => module.documentCount > 0) ?? rootModules[0]
  )?.id;
}

const emptyLibrary: DocumentLibraryPage = {
  items: [],
  limit: HISTORY_PREVIEW_LIMIT,
  offset: 0,
  total: 0,
};

interface DocumentsPageProps {
  searchParams: Promise<DocumentLibrarySearchParams>;
}

export default async function DocumentsPage({
  searchParams,
}: DocumentsPageProps) {
  const query = parseDocumentLibraryQuery(await searchParams);
  const { client } = await createAuthorizedAdminApiContext({
    requireModulesAccess: true,
  });
  const [moduleSummaries, uploaders] = await Promise.all([
    client.listModuleSummaries("all"),
    client.listDocumentUploaders(),
  ]);
  const rootModules = moduleSummaries
    .filter((module) => !module.isDeleted && !module.parentModuleId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const grouped = rootModules.length > 0 && !hasContentFilters(query);
  const historyModuleId = grouped
    ? resolveHistoryModuleId(rootModules, query.moduleId)
    : undefined;

  // En la vista agrupada no se bloquea el render con la consulta de la
  // biblioteca: el marco del Historial, el carril y los conteos ya llegan con
  // el resumen de módulos, y el panel del módulo inicial se llena con la server
  // action apenas monta la vista. Con filtros activos sí se consulta aquí: la
  // tabla plana necesita sus filas desde el primer render.
  let library: DocumentLibraryPage = emptyLibrary;
  let loadError = false;
  const initialPagePending = grouped;

  if (!grouped) {
    try {
      library = await client.listDocumentLibrary(query);
    } catch {
      // La vista muestra el aviso con la opción de reintentar sin bloquear el
      // resto de la pantalla: el carril de módulos sigue navegable.
      loadError = true;
    }
  }

  if (!grouped && !loadError && query.page > 1 && library.items.length === 0) {
    const firstPage = await client.listDocumentLibrary({
      ...query,
      offset: 0,
    });
    if (firstPage.total > 0) {
      const lastPage = Math.ceil(firstPage.total / firstPage.limit);
      redirect(documentLibraryHref(query, lastPage));
    }
  }

  return (
    <AdminPage
      description="Consulta y revisa toda la biblioteca documental registrada por módulos."
      title="Historial de documentos"
    >
      <DocumentLibraryView
        activeFilterCount={countDocumentLibraryFilters(query)}
        historyGrouped={grouped}
        historyLayout
        historyModuleId={historyModuleId}
        initialPagePending={initialPagePending}
        library={library}
        loadError={loadError}
        modules={moduleSummaries}
        moduleSummaries={moduleSummaries}
        query={query}
        quickActions
        uploaders={uploaders}
      />
    </AdminPage>
  );
}
