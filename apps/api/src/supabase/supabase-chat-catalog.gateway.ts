import type { PostgrestError } from '@supabase/supabase-js';
import { ServiceUnavailableException } from '@nestjs/common';
import type {
  AvailableDocument,
  ChatCatalogGateway,
} from '../chat/catalog/chat-catalog.types';
import type { SupabaseServerClient } from './supabase.server-client';

/** Página acotada de PostgREST; se recorren varias para no confundir página con top-k. */
const CATALOG_PAGE_SIZE = 100;
/** Máximo configurado por respuesta en Supabase local; las relaciones se recorren por páginas. */
const RELATION_PAGE_SIZE = 1_000;
const MAX_SECTIONS_PER_DOCUMENT = 6;
/** Fragmentos iniciales que se envían a la IA para resumir un documento. */
const OPENING_CHUNKS = 8;
const OPENING_TEXT_CHARS = 6_000;

interface CatalogDocumentRow {
  approved_version_id: string | null;
  document_type: string;
  id: string;
  issuance_year: number | null;
  metadata: unknown;
  resolution_number: string | null;
  title: string;
}

interface CatalogDocumentVersionRow {
  id: string;
  mime_type: string;
  original_file_name: string;
  page_count: number;
}

interface CatalogDocumentModuleRow {
  document_id: string;
  module_id: string;
}

interface CatalogModuleRow {
  id: string;
  is_active: boolean;
  is_deleted: boolean;
  name: string;
  parent_module_id: string | null;
  sort_order: number;
}

function batches<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function databaseError(error: PostgrestError): never {
  throw new ServiceUnavailableException({
    code: 'CHAT_CATALOG_UNAVAILABLE',
    message: error.message,
  });
}

/**
 * Documentos que el asistente puede citar hoy. Replica los criterios de
 * `search_document_chunks` (migración 20260908151631): no eliminado, no demo,
 * vigente y activo, con la versión aprobada indexada y asociado a un módulo
 * activo (con su padre activo). Así el catálogo nunca ofrece un documento que
 * el RAG no podría usar como sustento.
 */
export class SupabaseChatCatalogGatewayAdapter implements ChatCatalogGateway {
  constructor(private readonly client: SupabaseServerClient | null) {}

  private requireClient(): SupabaseServerClient {
    if (!this.client) {
      throw new ServiceUnavailableException({
        code: 'SUPABASE_NOT_CONFIGURED',
        message: 'Supabase no está configurado.',
      });
    }
    return this.client;
  }

  async listAvailableDocuments(): Promise<AvailableDocument[]> {
    const client = this.requireClient();

    // El conteo que ve el docente debe ser el real: se recorren todas las
    // páginas y se usa un desempate único para no omitir homónimos en frontera.
    const documentRows: CatalogDocumentRow[] = [];
    for (let from = 0; ; from += CATALOG_PAGE_SIZE) {
      const documents = await client
        .from('documents')
        .select(
          'id, title, document_type, issuance_year, resolution_number, approved_version_id, metadata',
        )
        .eq('is_deleted', false)
        .eq('situation', 'current')
        .eq('publication_status', 'active')
        .not('approved_version_id', 'is', null)
        .is('metadata->demoSeed', null)
        .order('title', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + CATALOG_PAGE_SIZE - 1);
      if (documents.error) databaseError(documents.error);
      const page = documents.data ?? [];
      documentRows.push(...(page as CatalogDocumentRow[]));
      if (page.length < CATALOG_PAGE_SIZE) break;
    }

    const candidates = documentRows.filter((document) => {
      const metadata = document.metadata;
      return !(
        metadata &&
        typeof metadata === 'object' &&
        !Array.isArray(metadata) &&
        'demoSeed' in metadata
      );
    });
    if (!candidates.length) return [];

    const approvedVersionIds = candidates
      .map((document) => document.approved_version_id)
      .filter((id): id is string => Boolean(id));
    const documentIds = candidates.map((document) => document.id);

    const loadVersions = async (): Promise<CatalogDocumentVersionRow[]> => {
      const rows: CatalogDocumentVersionRow[] = [];
      for (const batch of batches(approvedVersionIds, CATALOG_PAGE_SIZE)) {
        const result = await client
          .from('document_versions')
          .select('id, mime_type, original_file_name, page_count')
          .in('id', batch)
          .eq('ingestion_status', 'indexed');
        if (result.error) databaseError(result.error);
        rows.push(...((result.data ?? []) as CatalogDocumentVersionRow[]));
      }
      return rows;
    };
    const loadLinks = async (): Promise<CatalogDocumentModuleRow[]> => {
      const rows: CatalogDocumentModuleRow[] = [];
      for (const batch of batches(documentIds, CATALOG_PAGE_SIZE)) {
        for (let from = 0; ; from += RELATION_PAGE_SIZE) {
          const result = await client
            .from('document_modules')
            .select('document_id, module_id')
            .in('document_id', batch)
            .order('document_id', { ascending: true })
            .order('module_id', { ascending: true })
            .range(from, from + RELATION_PAGE_SIZE - 1);
          if (result.error) databaseError(result.error);
          const page = (result.data ?? []) as CatalogDocumentModuleRow[];
          rows.push(...page);
          if (page.length < RELATION_PAGE_SIZE) break;
        }
      }
      return rows;
    };
    const loadModules = async (): Promise<CatalogModuleRow[]> => {
      const rows: CatalogModuleRow[] = [];
      for (let from = 0; ; from += RELATION_PAGE_SIZE) {
        const result = await client
          .from('modules')
          .select(
            'id, name, parent_module_id, is_active, is_deleted, sort_order',
          )
          .order('id', { ascending: true })
          .range(from, from + RELATION_PAGE_SIZE - 1);
        if (result.error) databaseError(result.error);
        const page = (result.data ?? []) as CatalogModuleRow[];
        rows.push(...page);
        if (page.length < RELATION_PAGE_SIZE) break;
      }
      return rows;
    };

    const [versions, links, modules] = await Promise.all([
      loadVersions(),
      loadLinks(),
      loadModules(),
    ]);

    const indexedVersionById = new Map(
      versions.map((version) => [version.id, version]),
    );
    const moduleById = new Map(modules.map((module) => [module.id, module]));
    /** Nombre del módulo raíz si el módulo (y su padre) están activos. */
    const activeRootName = (moduleId: string): string | null => {
      const module = moduleById.get(moduleId);
      if (!module || !module.is_active || module.is_deleted) return null;
      if (!module.parent_module_id) return module.name;
      const parent = moduleById.get(module.parent_module_id);
      return parent && parent.is_active && !parent.is_deleted
        ? parent.name
        : null;
    };

    const rootNamesByDocument = new Map<string, Set<string>>();
    const moduleIdsByDocument = new Map<string, Set<string>>();
    for (const link of links) {
      const name = activeRootName(link.module_id);
      if (!name) continue;
      const names = rootNamesByDocument.get(link.document_id) ?? new Set();
      names.add(name);
      rootNamesByDocument.set(link.document_id, names);
      const ids = moduleIdsByDocument.get(link.document_id) ?? new Set();
      ids.add(link.module_id);
      const parentId = moduleById.get(link.module_id)?.parent_module_id;
      if (parentId) ids.add(parentId);
      moduleIdsByDocument.set(link.document_id, ids);
    }

    const eligible = candidates.filter(
      (document) =>
        document.approved_version_id !== null &&
        indexedVersionById.has(document.approved_version_id) &&
        rootNamesByDocument.has(document.id),
    );
    if (!eligible.length) return [];

    // Secciones de todo el catálogo, por lotes: un glosario ubicado después
    // del documento 30 también debe poder encontrarse por su encabezado.
    const sectionBatches: (typeof eligible)[] = [];
    for (let index = 0; index < eligible.length; index += 40) {
      sectionBatches.push(eligible.slice(index, index + 40));
    }
    const sectionResults = await Promise.all(
      sectionBatches.map((batch) =>
        client
          .from('document_chunks')
          .select('document_id, section_title')
          .in(
            'document_version_id',
            batch
              .map((document) => document.approved_version_id)
              .filter((id): id is string => id !== null),
          )
          .not('section_title', 'is', null)
          .order('chunk_index', { ascending: true })
          .limit(batch.length * MAX_SECTIONS_PER_DOCUMENT * 4),
      ),
    );
    for (const result of sectionResults) {
      if (result.error) databaseError(result.error);
    }

    const sectionsByDocument = new Map<string, string[]>();
    for (const row of sectionResults.flatMap((result) => result.data ?? [])) {
      const title = row.section_title?.trim();
      if (!title) continue;
      const list = sectionsByDocument.get(row.document_id) ?? [];
      if (list.length < MAX_SECTIONS_PER_DOCUMENT && !list.includes(title)) {
        list.push(title);
      }
      sectionsByDocument.set(row.document_id, list);
    }

    return eligible.map((document) => {
      const version = indexedVersionById.get(document.approved_version_id!);
      if (!version) {
        throw new ServiceUnavailableException({
          code: 'CHAT_CATALOG_UNAVAILABLE',
          message: 'An indexed catalog version could not be loaded.',
        });
      }
      return {
        documentType: document.document_type,
        id: document.id,
        issuanceYear: document.issuance_year,
        mimeType: version.mime_type,
        moduleIds: [...(moduleIdsByDocument.get(document.id) ?? [])],
        moduleNames: [...(rootNamesByDocument.get(document.id) ?? [])].sort(),
        originalFileName: version.original_file_name,
        pageCount: version.page_count,
        resolutionNumber: document.resolution_number,
        sectionTitles: sectionsByDocument.get(document.id) ?? [],
        title: document.title,
        versionId: document.approved_version_id!,
      };
    });
  }

  async getOpeningText(versionId: string): Promise<string> {
    const client = this.requireClient();
    const chunks = await client
      .from('document_chunks')
      .select('chunk_content')
      .eq('document_version_id', versionId)
      .order('chunk_index', { ascending: true })
      .limit(OPENING_CHUNKS);
    if (chunks.error) databaseError(chunks.error);
    return (chunks.data ?? [])
      .map((chunk) => chunk.chunk_content.trim())
      .join('\n\n')
      .slice(0, OPENING_TEXT_CHARS);
  }
}
