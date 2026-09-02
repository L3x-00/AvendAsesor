import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';
import {
  toManagedDocument,
  toDocumentLibraryRow,
  toStoredDocumentVersion,
  type DocumentLibraryPage,
  type ManagedDocument,
  type StoredDocumentVersion,
} from '../documents/domain/document';
import type {
  AddDocumentVersionRecord,
  CreateDocumentRecord,
  DocumentMetadataPatch,
  DocumentLibraryQuery,
  DocumentsGateway,
} from '../documents/documents.gateway';
import type { Json, SupabaseServerClient } from './supabase.server-client';

const DOCUMENT_COLUMNS =
  'id,title,document_type,issuing_entity,issuance_year,resolution_number,article_reference,publication_status,situation,replacement_document_id,replacement_date,replacement_year,replacement_reason,replacement_observation,deactivated_at,deactivated_by,deactivation_reason,is_deleted,deleted_at,deleted_by,deletion_reason,current_version_id,metadata,created_at,created_by,updated_at,updated_by';
const DOCUMENT_VERSION_COLUMNS =
  'id,document_id,version_number,storage_bucket,storage_path,original_file_name,mime_type,file_size_bytes,page_count,sha256,ingestion_status,ingestion_updated_at,uploaded_at,uploaded_by';
const NORMATIVE_DOCUMENTS_BUCKET = 'normative-documents';

function toJson(value: Record<string, unknown>): Json {
  return value as Json;
}

function databaseError(error: PostgrestError): never {
  if (error.code === 'P0002' || error.code === 'PGRST116') {
    throw new NotFoundException('Document was not found.');
  }

  if (error.code === '22023' || error.code === '23514') {
    throw new BadRequestException(
      'The requested document operation is invalid.',
    );
  }

  if (
    error.code === '23503' ||
    error.code === '23505' ||
    error.code === 'P0001'
  ) {
    throw new ConflictException(
      'The requested document state conflicts with existing data.',
    );
  }

  throw new ServiceUnavailableException(
    'The document store is temporarily unavailable.',
  );
}

function storageError(error: { message?: string }): never {
  if (error.message?.toLowerCase().includes('already exists')) {
    throw new ConflictException('The document file version already exists.');
  }

  throw new ServiceUnavailableException(
    'The private document storage is temporarily unavailable.',
  );
}

export class SupabaseDocumentsGatewayAdapter implements DocumentsGateway {
  constructor(private readonly client: SupabaseServerClient | null) {}

  async addVersion(input: AddDocumentVersionRecord): Promise<ManagedDocument> {
    const { data, error } = await this.requireClient().rpc(
      'add_document_version',
      {
        p_actor_id: input.actorId,
        p_document_id: input.documentId,
        p_file_size_bytes: input.fileSizeBytes,
        p_original_file_name: input.originalFileName,
        p_page_count: input.pageCount,
        p_sha256: input.sha256,
        p_storage_path: input.storagePath,
        p_version_id: input.versionId,
      },
    );

    if (error) {
      databaseError(error);
    }

    return this.parseDocument(data);
  }

  async create(input: CreateDocumentRecord): Promise<ManagedDocument> {
    const { data, error } = await this.requireClient().rpc(
      'create_document_with_initial_version',
      {
        p_actor_id: input.actorId,
        p_article_reference: input.articleReference ?? null,
        p_document_id: input.documentId,
        p_document_type: input.documentType,
        p_file_size_bytes: input.fileSizeBytes,
        p_issuance_year: input.issuanceYear ?? null,
        p_issuing_entity: input.issuingEntity ?? null,
        p_metadata: toJson(input.metadata),
        p_module_ids: input.moduleIds,
        p_original_file_name: input.originalFileName,
        p_page_count: input.pageCount,
        p_resolution_number: input.resolutionNumber ?? null,
        p_sha256: input.sha256,
        p_storage_path: input.storagePath,
        p_title: input.title,
        p_version_id: input.versionId,
      },
    );

    if (error) {
      databaseError(error);
    }

    return this.parseDocument(data);
  }

  async createDownloadUrl(
    storagePath: string,
    expiresInSeconds: number,
    disposition: 'attachment' | 'inline' = 'attachment',
  ): Promise<string> {
    const bucket = this.requireClient().storage.from(
      NORMATIVE_DOCUMENTS_BUCKET,
    );
    const { data, error } =
      disposition === 'attachment'
        ? await bucket.createSignedUrl(storagePath, expiresInSeconds, {
            download: true,
          })
        : await bucket.createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      storageError(error ?? {});
    }

    return data.signedUrl;
  }

  async findById(documentId: string): Promise<ManagedDocument | null> {
    const { data, error } = await this.requireClient()
      .from('documents')
      .select(DOCUMENT_COLUMNS)
      .eq('id', documentId)
      .maybeSingle();

    if (error) {
      databaseError(error);
    }

    return data ? this.parseDocument(data) : null;
  }

  async findVersion(
    documentId: string,
    versionId: string,
  ): Promise<StoredDocumentVersion | null> {
    const { data, error } = await this.requireClient()
      .from('document_versions')
      .select(DOCUMENT_VERSION_COLUMNS)
      .eq('document_id', documentId)
      .eq('id', versionId)
      .maybeSingle();

    if (error) {
      databaseError(error);
    }

    return data ? this.parseVersion(data) : null;
  }

  async linkModule(
    documentId: string,
    moduleId: string,
    actorId: string,
  ): Promise<void> {
    const { error } = await this.requireClient().rpc('link_document_module', {
      p_actor_id: actorId,
      p_document_id: documentId,
      p_module_id: moduleId,
    });

    if (error) {
      databaseError(error);
    }
  }

  async list(options: {
    limit: number;
    offset: number;
    status: 'active' | 'all' | 'inactive';
  }): Promise<ManagedDocument[]> {
    let query = this.requireClient()
      .from('documents')
      .select(DOCUMENT_COLUMNS)
      .eq('is_deleted', false);

    if (options.status !== 'all') {
      query = query.eq('publication_status', options.status);
    }

    const { data, error } = await query
      .order('updated_at', { ascending: false })
      .order('title', { ascending: true })
      .order('id', { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);

    if (error) {
      databaseError(error);
    }

    return (data ?? []).map((row) => this.parseDocument(row));
  }

  async listModuleIds(documentId: string): Promise<string[]> {
    const { data, error } = await this.requireClient()
      .from('document_modules')
      .select('module_id')
      .eq('document_id', documentId)
      .order('module_id', { ascending: true });

    if (error) {
      databaseError(error);
    }

    return (data ?? []).map((row) => row.module_id);
  }

  async listActorNames(actorIds: string[]): Promise<Record<string, string>> {
    if (actorIds.length === 0) return {};

    const { data, error } = await this.requireClient()
      .from('profiles')
      .select('id,full_name')
      .in('id', actorIds);

    if (error) {
      databaseError(error);
    }

    return Object.fromEntries(
      (data ?? []).map((profile) => [profile.id, profile.full_name]),
    );
  }

  async listLibrary(
    options: DocumentLibraryQuery,
  ): Promise<DocumentLibraryPage> {
    const { data, error } = await this.requireClient().rpc(
      'list_document_library',
      {
        p_document_type: options.documentType ?? null,
        p_issuance_year: options.issuanceYear ?? null,
        p_issuing_entity: options.issuingEntity ?? null,
        p_limit: options.limit,
        p_module_id: options.moduleId ?? null,
        p_offset: options.offset,
        p_query: options.q ?? null,
        p_situation: options.situation ?? null,
        p_sort: options.sort,
        p_submodule_id: options.submoduleId ?? null,
        p_technical_status: options.technicalStatus ?? null,
      },
    );

    if (error) {
      databaseError(error);
    }

    try {
      const parsed = (data ?? []).map((row) => toDocumentLibraryRow(row));
      return {
        items: parsed.map((row) => row.item),
        limit: options.limit,
        offset: options.offset,
        total: parsed.at(0)?.total ?? 0,
      };
    } catch {
      throw new InternalServerErrorException(
        'Document library data is invalid.',
      );
    }
  }

  async listVersions(documentId: string): Promise<StoredDocumentVersion[]> {
    const { data, error } = await this.requireClient()
      .from('document_versions')
      .select(DOCUMENT_VERSION_COLUMNS)
      .eq('document_id', documentId)
      .order('version_number', { ascending: false });

    if (error) {
      databaseError(error);
    }

    return (data ?? []).map((row) => this.parseVersion(row));
  }

  async logicalDelete(
    documentId: string,
    reason: string,
    actorId: string,
  ): Promise<void> {
    const { error } = await this.requireClient().rpc(
      'logically_delete_document',
      {
        p_actor_id: actorId,
        p_document_id: documentId,
        p_reason: reason,
      },
    );

    if (error) {
      databaseError(error);
    }
  }

  async removePdf(storagePath: string): Promise<boolean> {
    const { error } = await this.requireClient()
      .storage.from(NORMATIVE_DOCUMENTS_BUCKET)
      .remove([storagePath]);

    return !error;
  }

  async recordDownloadUrl(
    documentId: string,
    versionId: string,
    actorId: string,
  ): Promise<void> {
    const { error } = await this.requireClient().rpc(
      'record_document_download_url',
      {
        p_actor_id: actorId,
        p_document_id: documentId,
        p_document_version_id: versionId,
      },
    );

    if (error) {
      databaseError(error);
    }
  }

  async setStatus(
    documentId: string,
    isActive: boolean,
    reason: string | undefined,
    actorId: string,
  ): Promise<ManagedDocument> {
    const { data, error } = await this.requireClient().rpc(
      'set_document_publication_status',
      {
        p_actor_id: actorId,
        p_document_id: documentId,
        p_is_active: isActive,
        p_reason: reason ?? null,
      },
    );

    if (error) {
      databaseError(error);
    }

    return this.parseDocument(data);
  }

  async setSituation(
    documentId: string,
    situation: 'archived' | 'current' | 'replaced',
    actorId: string,
    options: {
      observation?: string;
      reason?: string;
      replacementDate?: string;
      replacementDocumentId?: string;
      replacementYear?: number;
    },
  ): Promise<ManagedDocument> {
    const { data, error } = await this.requireClient().rpc(
      'set_document_situation',
      {
        p_actor_id: actorId,
        p_document_id: documentId,
        p_observation: options.observation ?? null,
        p_reason: options.reason ?? null,
        p_replacement_date: options.replacementDate ?? null,
        p_replacement_document_id: options.replacementDocumentId ?? null,
        p_replacement_year: options.replacementYear ?? null,
        p_situation: situation,
      },
    );

    if (error) {
      databaseError(error);
    }

    return this.parseDocument(data);
  }

  async unlinkModule(
    documentId: string,
    moduleId: string,
    actorId: string,
  ): Promise<void> {
    const { error } = await this.requireClient().rpc('unlink_document_module', {
      p_actor_id: actorId,
      p_document_id: documentId,
      p_module_id: moduleId,
    });

    if (error) {
      databaseError(error);
    }
  }

  async updateMetadata(
    documentId: string,
    patch: DocumentMetadataPatch,
    actorId: string,
  ): Promise<ManagedDocument> {
    const { data, error } = await this.requireClient().rpc(
      'update_document_metadata',
      {
        p_actor_id: actorId,
        p_document_id: documentId,
        p_patch: toJson({ ...patch }),
      },
    );

    if (error) {
      databaseError(error);
    }

    return this.parseDocument(data);
  }

  async uploadPdf(storagePath: string, content: Buffer): Promise<void> {
    const { error } = await this.requireClient()
      .storage.from(NORMATIVE_DOCUMENTS_BUCKET)
      .upload(storagePath, content, {
        cacheControl: '31536000',
        contentType: 'application/pdf',
        upsert: false,
      });

    if (error) {
      storageError(error);
    }
  }

  private parseDocument(row: unknown): ManagedDocument {
    try {
      return toManagedDocument(row);
    } catch {
      throw new InternalServerErrorException('Document data is invalid.');
    }
  }

  private parseVersion(row: unknown): StoredDocumentVersion {
    try {
      return toStoredDocumentVersion(row);
    } catch {
      throw new InternalServerErrorException(
        'Document version data is invalid.',
      );
    }
  }

  private requireClient(): SupabaseServerClient {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Document storage is not configured.',
      );
    }

    return this.client;
  }
}
