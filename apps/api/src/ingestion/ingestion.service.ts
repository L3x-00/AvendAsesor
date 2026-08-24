import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SUPABASE_INGESTION_GATEWAY } from '../supabase/supabase.constants';
import { ChunkingService } from './chunking.service';
import type { EmbeddingsGateway } from './embeddings.gateway';
import type { IngestionGateway } from './ingestion.gateway';
import { EMBEDDINGS_GATEWAY } from './ingestion.tokens';
import { OcrService } from './ocr.service';
import { PdfExtractionService } from './pdf-extraction.service';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  constructor(
    @Inject(SUPABASE_INGESTION_GATEWAY)
    private readonly gateway: IngestionGateway,
    @Inject(EMBEDDINGS_GATEWAY) private readonly embeddings: EmbeddingsGateway,
    private readonly pdf: PdfExtractionService,
    private readonly ocr: OcrService,
    private readonly chunking: ChunkingService,
    private readonly config: ConfigService,
  ) {}

  async processNext(): Promise<boolean> {
    const leaseSeconds =
      this.config.get<number>('RAG_INGESTION_LEASE_SECONDS') ?? 300;
    const job = await this.gateway.claimNext(leaseSeconds);
    if (!job) return false;
    try {
      const file = await this.gateway.downloadPdf(
        job.storageBucket,
        job.storagePath,
      );
      const pages = await this.pdf.extract(file);
      const sparse = pages
        .filter((page) => page.text.replace(/\s/g, '').length < 50)
        .map((page) => page.pageNumber);
      if (sparse.length) {
        const images = await this.pdf.render(file, sparse);
        for (const page of pages) {
          const image = images.get(page.pageNumber);
          if (image) page.text = await this.ocr.recognize(image);
        }
      }
      const chunks = this.chunking.chunk(pages);
      if (!chunks.length) throw new Error('INGESTION_EMPTY_TEXT');
      const vectors = await this.embeddings.embed(
        chunks.map((chunk) => chunk.chunkContent),
      );
      if (
        vectors.length !== chunks.length ||
        vectors.some((embedding) => embedding.length !== 1536)
      ) {
        throw new Error('INGESTION_INVALID_EMBEDDING');
      }
      await this.gateway.clearChunks(job);
      for (let offset = 0; offset < chunks.length; offset += 25) {
        await this.gateway.insertChunks(
          chunks.slice(offset, offset + 25).map((chunk, index) => ({
            ...chunk,
            documentId: job.documentId,
            documentVersionId: job.documentVersionId,
            embedding: vectors[offset + index],
          })),
        );
        await this.gateway.refreshLease(job, leaseSeconds);
      }
      await this.gateway.complete(job);
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unexpected ingestion failure';
      try {
        await this.gateway.fail(
          job,
          'INGESTION_FAILED',
          message.slice(0, 1000),
          true,
        );
      } catch {
        this.logger.error(
          `Could not persist the failure for ingestion job ${job.jobId}.`,
        );
      }
      this.logger.error(`Document ingestion failed for job ${job.jobId}.`);
      return false;
    }
  }
}
