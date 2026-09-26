import type { PostgrestError } from '@supabase/supabase-js';
import { ServiceUnavailableException } from '@nestjs/common';
import type {
  AvailableDocument,
  ChatCatalogGateway,
} from '../chat/catalog/chat-catalog.types';
import type { SupabaseServerClient } from './supabase.server-client';

/** Documentos candidatos por consulta; el conteo mostrado sale de aquí. */
const MAX_CANDIDATES = 200;
/** Documentos listados y descritos a la IA (ver ChatCatalogService). */
const MAX_DESCRIBED_DOCUMENTS = 25;
const MAX_SECTIONS_PER_DOCUMENT = 6;

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

    // Tope amplio: el conteo que ve el docente debe ser el real, así que los
    // demos se excluyen en la consulta y no después de limitar filas.
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
      .limit(MAX_CANDIDATES);
    if (documents.error) databaseError(documents.error);

    const candidates = (documents.data ?? []).filter((document) => {
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

    const [versions, links, modules] = await Promise.all([
      client
        .from('document_versions')
        .select('id')
        .in('id', approvedVersionIds)
        .eq('ingestion_status', 'indexed'),
      client
        .from('document_modules')
        .select('document_id, module_id')
        .in('document_id', documentIds),
      client
        .from('modules')
        .select(
          'id, name, parent_module_id, is_active, is_deleted, sort_order',
        ),
    ]);
    for (const result of [versions, links, modules]) {
      if (result.error) databaseError(result.error);
    }

    const indexed = new Set((versions.data ?? []).map((version) => version.id));
    const moduleById = new Map(
      (modules.data ?? []).map((module) => [module.id, module]),
    );
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
    for (const link of links.data ?? []) {
      const name = activeRootName(link.module_id);
      if (!name) continue;
      const names = rootNamesByDocument.get(link.document_id) ?? new Set();
      names.add(name);
      rootNamesByDocument.set(link.document_id, names);
    }

    const eligible = candidates.filter(
      (document) =>
        document.approved_version_id !== null &&
        indexed.has(document.approved_version_id) &&
        rootNamesByDocument.has(document.id),
    );
    if (!eligible.length) return [];

    // Secciones solo de los documentos que se muestran y se dan a la IA.
    const described = eligible.slice(0, MAX_DESCRIBED_DOCUMENTS);
    const sections = await client
      .from('document_chunks')
      .select('document_id, section_title')
      .in(
        'document_version_id',
        described.map((document) => document.approved_version_id),
      )
      .not('section_title', 'is', null)
      .order('chunk_index', { ascending: true })
      .limit(MAX_DESCRIBED_DOCUMENTS * MAX_SECTIONS_PER_DOCUMENT * 4);
    if (sections.error) databaseError(sections.error);

    const sectionsByDocument = new Map<string, string[]>();
    for (const row of sections.data ?? []) {
      const title = row.section_title?.trim();
      if (!title) continue;
      const list = sectionsByDocument.get(row.document_id) ?? [];
      if (list.length < MAX_SECTIONS_PER_DOCUMENT && !list.includes(title)) {
        list.push(title);
      }
      sectionsByDocument.set(row.document_id, list);
    }

    return eligible.map((document) => ({
      documentType: document.document_type,
      id: document.id,
      issuanceYear: document.issuance_year,
      moduleNames: [...(rootNamesByDocument.get(document.id) ?? [])].sort(),
      resolutionNumber: document.resolution_number,
      sectionTitles: sectionsByDocument.get(document.id) ?? [],
      title: document.title,
    }));
  }
}
