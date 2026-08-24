import { ServiceUnavailableException } from '@nestjs/common';
import { SupabaseIngestionGatewayAdapter } from './supabase-ingestion.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

const claimedJob = {
  attempt_count: 1,
  document_id: 'document-id',
  document_version_id: 'version-id',
  job_id: 'job-id',
  lease_token: 'lease-token',
  page_count: 2,
  sha256: 'a'.repeat(64),
  storage_bucket: 'normative-documents',
  storage_path: 'documents/document-id/versions/version-id.pdf',
};

function createClient(options: {
  downloadData?: Blob | null;
  error?: { code: string; message: string } | null;
  rpcData?: unknown;
}) {
  const rpc = jest.fn().mockResolvedValue({
    data: options.rpcData ?? [claimedJob],
    error: options.error ?? null,
  });
  const insert = jest.fn().mockResolvedValue({ error: options.error ?? null });
  const from = jest.fn().mockReturnValue({ insert });
  const download = jest.fn().mockResolvedValue({
    data: options.downloadData ?? new Blob([Buffer.from('%PDF')]),
    error: options.error ?? null,
  });
  const storage = { from: jest.fn().mockReturnValue({ download }) };

  return {
    client: { from, rpc, storage } as unknown as SupabaseServerClient,
    download,
    from,
    insert,
    rpc,
    storage,
  };
}

describe('SupabaseIngestionGatewayAdapter', () => {
  it('fails closed when the server-only client does not exist', async () => {
    const gateway = new SupabaseIngestionGatewayAdapter(null);

    await expect(gateway.claimNext(300)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('claims and maps a durable ingestion lease without exposing raw rows', async () => {
    const { client, rpc } = createClient({});
    const gateway = new SupabaseIngestionGatewayAdapter(client);

    await expect(gateway.claimNext(300)).resolves.toEqual({
      attemptCount: 1,
      documentId: 'document-id',
      documentVersionId: 'version-id',
      jobId: 'job-id',
      leaseToken: 'lease-token',
      pageCount: 2,
      sha256: 'a'.repeat(64),
      storageBucket: 'normative-documents',
      storagePath: 'documents/document-id/versions/version-id.pdf',
    });
    expect(rpc).toHaveBeenCalledWith('claim_document_ingestion_job', {
      p_lease_seconds: 300,
    });
  });

  it('returns no job from an empty claim result', async () => {
    const { client } = createClient({ rpcData: [] });
    const gateway = new SupabaseIngestionGatewayAdapter(client);

    await expect(gateway.claimNext(300)).resolves.toBeNull();
  });

  it('uses lease-protected RPCs and private storage for worker operations', async () => {
    const { client, from, insert, rpc, storage } = createClient({});
    const gateway = new SupabaseIngestionGatewayAdapter(client);
    const job = (await gateway.claimNext(300))!;

    await gateway.clearChunks(job);
    await gateway.refreshLease(job, 120);
    await gateway.insertChunks([
      {
        chunkContent: 'Contenido normativo',
        chunkIndex: 0,
        documentId: job.documentId,
        documentVersionId: job.documentVersionId,
        embedding: Array.from({ length: 1536 }, () => 0.1),
        pageEnd: 1,
        pageStart: 1,
        tokenCount: 3,
      },
    ]);
    await expect(
      gateway.downloadPdf(job.storageBucket, job.storagePath),
    ).resolves.toEqual(Buffer.from('%PDF'));
    await gateway.complete(job);
    await gateway.fail(job, 'INGESTION_FAILED', 'failure', true);

    expect(rpc).toHaveBeenCalledWith(
      'clear_document_ingestion_chunks',
      expect.objectContaining({ p_job_id: job.jobId }),
    );
    expect(rpc).toHaveBeenCalledWith(
      'refresh_document_ingestion_job_lease',
      expect.objectContaining({ p_lease_seconds: 120 }),
    );
    expect(rpc).toHaveBeenCalledWith(
      'complete_document_ingestion_job',
      expect.objectContaining({ p_lease_token: job.leaseToken }),
    );
    expect(rpc).toHaveBeenCalledWith(
      'fail_document_ingestion_job',
      expect.objectContaining({ p_retryable: true }),
    );
    expect(storage.from).toHaveBeenCalledWith('normative-documents');
    expect(from).toHaveBeenCalledWith('document_chunks');
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('maps storage and database failures to a safe service error', async () => {
    const { client } = createClient({
      error: { code: 'P0002', message: 'lease lost' },
    });
    const gateway = new SupabaseIngestionGatewayAdapter(client);

    await expect(gateway.claimNext(300)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
