import { redirect } from "next/navigation";
import { AdminPage } from "@/components/admin/admin-page";
import {
  DocumentLibraryView,
  type HistoryModulePreview,
} from "@/components/admin/document-library-view";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";
import {
  countDocumentLibraryFilters,
  documentLibraryHref,
  parseDocumentLibraryQuery,
  type DocumentLibrarySearchParams,
  type ParsedDocumentLibraryQuery,
} from "@/lib/admin-api/document-library-query";
import type { DocumentLibraryPage } from "@/lib/admin-api/types";

/** Filas visibles por módulo en la vista general del Historial. */
const HISTORY_PREVIEW_LIMIT = 3;

/**
 * El Historial agrupa por módulo solo cuando no hay una búsqueda o filtro de
 * contenido: con filtros activos los resultados deben poder cruzar módulos, así
 * que se conserva la consulta plana. Elegir un módulo (o un submódulo) no cuenta
 * como filtro de contenido.
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

  let library: DocumentLibraryPage;
  let modulePreviews: HistoryModulePreview[] = [];
  if (rootModules.length > 0 && !hasContentFilters(query)) {
    // Cada panel necesita su propio total y sus primeras filas: se consultan en
    // paralelo y acotadas al módulo, reutilizando el endpoint autorizado.
    modulePreviews = await Promise.all(
      rootModules.map(async (module) => ({
        moduleId: module.id,
        page: await client.listDocumentLibrary({
          ...query,
          limit: HISTORY_PREVIEW_LIMIT,
          moduleId: module.id,
          offset: 0,
          submoduleId: undefined,
        }),
      })),
    );
    library =
      modulePreviews.find((preview) => preview.moduleId === query.moduleId)
        ?.page ?? modulePreviews[0].page;
  } else {
    library = await client.listDocumentLibrary(query);

    if (query.page > 1 && library.items.length === 0) {
      const firstPage = await client.listDocumentLibrary({
        ...query,
        offset: 0,
      });
      if (firstPage.total > 0) {
        const lastPage = Math.ceil(firstPage.total / firstPage.limit);
        redirect(documentLibraryHref(query, lastPage));
      }
    }
  }

  return (
    <AdminPage
      description="Consulta y revisa toda la biblioteca documental registrada por módulos."
      title="Historial de documentos"
    >
      <DocumentLibraryView
        activeFilterCount={countDocumentLibraryFilters(query)}
        library={library}
        historyLayout
        modules={moduleSummaries}
        modulePreviews={modulePreviews}
        moduleSummaries={moduleSummaries}
        query={query}
        quickActions
        uploaders={uploaders}
      />
    </AdminPage>
  );
}
