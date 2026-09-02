import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
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
  const { access, client } = await createAuthorizedAdminApiContext();
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
    <AdminShell
      activeSection="documents"
      description="Consulta y revisa toda la biblioteca documental registrada. La estructura y la carga de nuevos PDF se gestionan desde Módulos."
      title="Historial de documentos"
      userName={access.fullName}
      userRole={access.role}
    >
      <DocumentLibraryView
        activeFilterCount={countDocumentLibraryFilters(query)}
        library={initialLibrary}
        modules={modules}
        query={query}
      />
    </AdminShell>
  );
}
