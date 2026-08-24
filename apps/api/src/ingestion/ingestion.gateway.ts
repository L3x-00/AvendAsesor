export interface ClaimedIngestionJob {
  attemptCount: number;
  documentId: string;
  documentVersionId: string;
  jobId: string;
  leaseToken: string;
  pageCount: number;
  sha256: string;
  storageBucket: string;
  storagePath: string;
}

export interface PersistedDocumentChunk {
  articleReference?: string;
  chunkContent: string;
  chunkIndex: number;
  documentId: string;
  documentVersionId: string;
  embedding: number[];
  numeralReference?: string;
  pageEnd: number;
  pageStart: number;
  sectionTitle?: string;
  tokenCount: number;
}

export interface IngestionGateway {
  claimNext(leaseSeconds: number): Promise<ClaimedIngestionJob | null>;
  clearChunks(job: ClaimedIngestionJob): Promise<void>;
  complete(job: ClaimedIngestionJob): Promise<void>;
  downloadPdf(storageBucket: string, storagePath: string): Promise<Buffer>;
  fail(
    job: ClaimedIngestionJob,
    errorCode: string,
    errorMessage: string,
    retryable: boolean,
  ): Promise<void>;
  insertChunks(chunks: PersistedDocumentChunk[]): Promise<void>;
  refreshLease(job: ClaimedIngestionJob, leaseSeconds: number): Promise<void>;
}
