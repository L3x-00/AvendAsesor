import { redirect } from "next/navigation";
import { AdminPage } from "@/components/admin/admin-page";
import { DocumentLibraryView } from "@/components/admin/document-library-view";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";
import {
  countDocumentLibraryFilters,
  documentLibraryHref,
  parseDocumentLibraryQuery,
  type DocumentLibrarySearchParams,
} from "@/lib/admin-api/document-library-query";

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
  const [initialLibrary, modules] = await Promise.all([
    client.listDocumentLibrary(query),
    client.listModules("all"),
  ]);

  if (query.page > 1 && initialLibrary.items.length === 0) {
    const firstPage = await client.listDocumentLibrary({ ...query, offset: 0 });
    if (firstPage.total > 0) {
      const lastPage = Math.ceil(firstPage.total / firstPage.limit);
      redirect(documentLibraryHref(query, lastPage));
    }
  }

  return (
    <AdminPage
      description="Consulta y revisa toda la biblioteca documental registrada. La estructura y la carga de nuevos PDF se gestionan desde Módulos."
      title="Historial de documentos"
    >
      <DocumentLibraryView
        activeFilterCount={countDocumentLibraryFilters(query)}
        library={initialLibrary}
        modules={modules}
        query={query}
      />
    </AdminPage>
  );
}
