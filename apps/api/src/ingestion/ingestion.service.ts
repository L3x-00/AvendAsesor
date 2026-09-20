import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SUPABASE_INGESTION_GATEWAY } from '../supabase/supabase.constants';
import { ChunkingService } from './chunking.service';
import type { EmbeddingsGateway } from './embeddings.gateway';
import type { IngestionGateway } from './ingestion.gateway';
import { EMBEDDINGS_GATEWAY } from './ingestion.tokens';
import { OcrService } from './ocr.service';
import { PdfExtractionService } from './pdf-extraction.service';

/** Tope de páginas sometidas a OCR local por trabajo (acota rasterizado + CPU). */
const MAX_OCR_PAGES = 40;
/** Páginas rasterizadas por lote: mantiene pocos PNG en memoria a la vez. */
const OCR_RENDER_BATCH = 5;

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
      const sparsePages = pages
        .filter((page) => page.text.replace(/\s/g, '').length < 50)
        .map((page) => page.pageNumber);
      // Guardas de memoria para Render Free (512 MB): acotar el nº de páginas
      // OCR y renderizar en lotes pequeños (no todos los PNG a escala 2 a la
      // vez), con un único worker Tesseract reutilizado por el job.
      const sparse = sparsePages.slice(0, MAX_OCR_PAGES);
      if (sparse.length < sparsePages.length) {
        this.logger.warn(
          `OCR local acotado a ${MAX_OCR_PAGES} de ${sparsePages.length} páginas para el job ${job.jobId}.`,
        );
      }
      if (sparse.length) {
        const pageByNumber = new Map(
          pages.map((page) => [page.pageNumber, page]),
        );
        await this.ocr.withWorker(async (recognize) => {
          for (
            let offset = 0;
            offset < sparse.length;
            offset += OCR_RENDER_BATCH
          ) {
            const batch = sparse.slice(offset, offset + OCR_RENDER_BATCH);
            const images = await this.pdf.render(file, batch);
            for (const pageNumber of batch) {
              const image = images.get(pageNumber);
              const page = pageByNumber.get(pageNumber);
              if (image && page) page.text = await recognize(image);
            }
          }
        });
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
