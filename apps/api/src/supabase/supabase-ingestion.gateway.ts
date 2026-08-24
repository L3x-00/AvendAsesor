import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';
import type {
  ClaimedIngestionJob,
  IngestionGateway,
  PersistedDocumentChunk,
} from '../ingestion/ingestion.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

function toServiceUnavailable(error: PostgrestError | null): never {
  throw new ServiceUnavailableException(
    error?.code === 'P0002'
      ? 'The ingestion worker lease is no longer active.'
      : 'The document ingestion store is temporarily unavailable.',
  );
}

@Injectable()
export class SupabaseIngestionGatewayAdapter implements IngestionGateway {
  constructor(private readonly client: SupabaseServerClient | null) {}

  async claimNext(leaseSeconds: number): Promise<ClaimedIngestionJob | null> {
    const { data, error } = await this.requireClient().rpc(
      'claim_document_ingestion_job',
      { p_lease_seconds: leaseSeconds },
    );
    if (error) toServiceUnavailable(error);
    const job = data?.[0];
    return job
      ? {
          attemptCount: job.attempt_count,
          documentId: job.document_id,
          documentVersionId: job.document_version_id,
          jobId: job.job_id,
          leaseToken: job.lease_token,
          pageCount: job.page_count,
          sha256: job.sha256,
          storageBucket: job.storage_bucket,
          storagePath: job.storage_path,
        }
      : null;
  }

  async clearChunks(job: ClaimedIngestionJob): Promise<void> {
    await this.callLeaseRpc('clear_document_ingestion_chunks', job);
  }

  async complete(job: ClaimedIngestionJob): Promise<void> {
    await this.callLeaseRpc('complete_document_ingestion_job', job);
  }

  async downloadPdf(
    storageBucket: string,
    storagePath: string,
  ): Promise<Buffer> {
    const { data, error } = await this.requireClient()
      .storage.from(storageBucket)
      .download(storagePath);
    if (error || !data) {
      throw new ServiceUnavailableException(
        'The private PDF file is temporarily unavailable for ingestion.',
      );
    }
    return Buffer.from(await data.arrayBuffer());
  }

  async fail(
    job: ClaimedIngestionJob,
    errorCode: string,
    errorMessage: string,
    retryable: boolean,
  ): Promise<void> {
    const { error } = await this.requireClient().rpc(
      'fail_document_ingestion_job',
      {
        p_error_code: errorCode,
        p_error_message: errorMessage,
        p_job_id: job.jobId,
        p_lease_token: job.leaseToken,
        p_retryable: retryable,
      },
    );
    if (error) toServiceUnavailable(error);
  }

  async insertChunks(chunks: PersistedDocumentChunk[]): Promise<void> {
    if (!chunks.length) return;
    const { error } = await this.requireClient()
      .from('document_chunks')
      .insert(
        chunks.map((chunk) => ({
          article_reference: chunk.articleReference ?? null,
          chunk_content: chunk.chunkContent,
          chunk_index: chunk.chunkIndex,
          document_id: chunk.documentId,
          document_version_id: chunk.documentVersionId,
          embedding: chunk.embedding,
          numeral_reference: chunk.numeralReference ?? null,
          page_end: chunk.pageEnd,
          page_start: chunk.pageStart,
          section_title: chunk.sectionTitle ?? null,
          token_count: chunk.tokenCount,
        })),
      );
    if (error) toServiceUnavailable(error);
  }

  async refreshLease(
    job: ClaimedIngestionJob,
    leaseSeconds: number,
  ): Promise<void> {
    const { error } = await this.requireClient().rpc(
      'refresh_document_ingestion_job_lease',
      {
        p_job_id: job.jobId,
        p_lease_seconds: leaseSeconds,
        p_lease_token: job.leaseToken,
      },
    );
    if (error) toServiceUnavailable(error);
  }

  private async callLeaseRpc(
    name: 'clear_document_ingestion_chunks' | 'complete_document_ingestion_job',
    job: ClaimedIngestionJob,
  ): Promise<void> {
    const { error } = await this.requireClient().rpc(name, {
      p_job_id: job.jobId,
      p_lease_token: job.leaseToken,
    });
    if (error) toServiceUnavailable(error);
  }

  private requireClient(): SupabaseServerClient {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Document ingestion is not configured.',
      );
    }
    return this.client;
  }
}
