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
  toStoredDocumentVersion,
  type ManagedDocument,
  type StoredDocumentVersion,
} from '../documents/domain/document';
import type {
  AddDocumentVersionRecord,
  CreateDocumentRecord,
  DocumentMetadataPatch,
  DocumentsGateway,
} from '../documents/documents.gateway';
import type {
  Json,
  SupabaseDatabase,
  SupabaseServerClient,
} from './supabase.server-client';

const DOCUMENT_COLUMNS =
  'id,title,document_type,issuing_entity,issuance_year,resolution_number,article_reference,publication_status,deactivated_at,deactivated_by,deactivation_reason,is_deleted,deleted_at,deleted_by,deletion_reason,current_version_id,metadata,created_at,created_by,updated_at,updated_by';
const DOCUMENT_VERSION_COLUMNS =
  'id,document_id,version_number,storage_bucket,storage_path,original_file_name,mime_type,file_size_bytes,page_count,sha256,uploaded_at,uploaded_by';
const NORMATIVE_DOCUMENTS_BUCKET = 'normative-documents';

type DocumentRow = SupabaseDatabase['public']['Tables']['documents']['Row'];

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
  ): Promise<string> {
    const { data, error } = await this.requireClient()
      .storage.from(NORMATIVE_DOCUMENTS_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds, { download: true });

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

  private parseDocument(row: DocumentRow | null): ManagedDocument {
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
