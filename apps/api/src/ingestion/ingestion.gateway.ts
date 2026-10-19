export interface ClaimedIngestionJob {
  attemptCount: number;
  documentId: string;
  documentVersionId: string;
  jobId: string;
  leaseToken: string;
  pageCount: number | null;
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
  complete(
    job: ClaimedIngestionJob,
    verifiedPdfPageCount: number | null,
  ): Promise<void>;
  downloadPdf(storageBucket: string, storagePath: string): Promise<Buffer>;
  /**
   * Descarga un artefacto opcional de enriquecimiento (por ejemplo, el Markdown
   * de MinerU). Devuelve `null` si no existe o no está disponible: el llamador
   * debe continuar con la extracción normal del PDF.
   */
  downloadOptionalObject?(
    storageBucket: string,
    storagePath: string,
  ): Promise<Buffer | null>;
  fail(
    job: ClaimedIngestionJob,
    errorCode: string,
    errorMessage: string,
    retryable: boolean,
  ): Promise<void>;
  insertChunks(chunks: PersistedDocumentChunk[]): Promise<void>;
  refreshLease(job: ClaimedIngestionJob, leaseSeconds: number): Promise<void>;
}
