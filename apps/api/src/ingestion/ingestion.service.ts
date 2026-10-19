import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAX_PDF_PAGES } from '../documents/pdf-inspection.service';
import { SUPABASE_INGESTION_GATEWAY } from '../supabase/supabase.constants';
import { ChunkingService, type ExtractedPage } from './chunking.service';
import { DocxExtractionService } from './docx-extraction.service';
import {
  detectIngestionFormat,
  isProbablyText,
  MAX_EXTRACTED_CHARS,
  type IngestionFormat,
} from './document-format';
import type { EmbeddingsGateway } from './embeddings.gateway';
import type {
  ClaimedIngestionJob,
  IngestionGateway,
} from './ingestion.gateway';
import { EMBEDDINGS_GATEWAY } from './ingestion.tokens';
import { MineruMarkdownService } from './mineru-markdown.service';
import { OcrService } from './ocr.service';
import { PdfExtractionService } from './pdf-extraction.service';

/** Tope de páginas sometidas a OCR local por trabajo (acota rasterizado + CPU). */
const MAX_OCR_PAGES = 40;
/** Páginas rasterizadas por lote: mantiene pocos PNG en memoria a la vez. */
const OCR_RENDER_BATCH = 5;
/**
 * Tope total de un trabajo. El OCR de 40 páginas escaneadas en Render Free
 * (0,1 CPU) puede tardar decenas de minutos; más que esto es un trabajo
 * colgado.
 */
export const MAX_JOB_DURATION_MS = 45 * 60_000;
/**
 * Sidecar Markdown producido por MinerU. Se guarda junto al PDF con el sufijo
 * `.mineru.md` y solo aporta texto/páginas; el PDF sigue siendo la fuente
 * canónica para citas y para el visor.
 */
export const MINERU_SIDECAR_SUFFIX = '.mineru.md';
const MAX_MINERU_SIDECAR_BYTES = 8 * 1024 * 1024;

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  /** Includes a timed-out operation until its resources have actually settled. */
  private active = false;
  constructor(
    @Inject(SUPABASE_INGESTION_GATEWAY)
    private readonly gateway: IngestionGateway,
    @Inject(EMBEDDINGS_GATEWAY) private readonly embeddings: EmbeddingsGateway,
    private readonly pdf: PdfExtractionService,
    private readonly docx: DocxExtractionService,
    private readonly ocr: OcrService,
    private readonly chunking: ChunkingService,
    private readonly mineru: MineruMarkdownService,
    private readonly config: ConfigService,
  ) {}

  async processNext(): Promise<boolean> {
    if (this.active) return false;
    this.active = true;
    const leaseSeconds =
      this.config.get<number>('RAG_INGESTION_LEASE_SECONDS') ?? 300;
    let job: ClaimedIngestionJob | null = null;
    let task: Promise<void> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let refresh: Promise<void> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const cancellation = new AbortController();
    try {
      job = await this.gateway.claimNext(leaseSeconds);
      if (!job) return false;
      const claimedJob = job;
      // La extracción y el OCR de un PDF escaneado pueden tardar más que el
      // turno: antes solo se renovaba al insertar fragmentos, así que el turno
      // vencía a mitad del OCR y el trabajo acababa en LEASE_EXPIRED.
      heartbeat = setInterval(
        () => {
          // A slow store must not leave another pending refresh every interval.
          if (refresh || cancellation.signal.aborted) return;
          refresh = this.gateway
            .refreshLease(claimedJob, leaseSeconds)
            .catch(() => {
              this.logger.warn(
                `Could not refresh the lease of job ${claimedJob.jobId}.`,
              );
            })
            .finally(() => {
              refresh = undefined;
            });
        },
        Math.max(10, Math.floor(leaseSeconds / 3)) * 1000,
      );
      heartbeat.unref?.();
      // Promise.race alone does not stop ingest(). Abort provider/OCR work and
      // check cancellation between stages; do not admit another job while a
      // non-cancellable extraction or store call from this one is still pending.
      task = this.ingest(job, leaseSeconds, cancellation.signal);
      await Promise.race([
        task,
        new Promise<never>((_, reject) => {
          deadline = setTimeout(() => {
            const error = new Error('INGESTION_TIMEOUT');
            cancellation.abort(error);
            reject(error);
          }, MAX_JOB_DURATION_MS);
          deadline.unref?.();
        }),
      ]);
      return true;
    } catch (error) {
      if (!job) throw error;
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
    } finally {
      clearInterval(heartbeat);
      if (deadline) clearTimeout(deadline);
      if (task || refresh) {
        // A job owns ALL its pending work, including the heartbeat request.
        // Its slot is released only after every owned promise has settled.
        void Promise.allSettled([task, refresh]).then(() => {
          this.active = false;
        });
      } else {
        this.active = false;
      }
    }
  }

  private async ingest(
    job: ClaimedIngestionJob,
    leaseSeconds: number,
    signal: AbortSignal,
  ): Promise<void> {
    const file = await this.gateway.downloadPdf(
      job.storageBucket,
      job.storagePath,
    );
    signal.throwIfAborted();
    const format = detectIngestionFormat(file);
    const pages = await this.extractPages(format, file, job, signal);
    signal.throwIfAborted();
    const chunks = this.chunking.chunk(pages);
    signal.throwIfAborted();
    if (!chunks.length) throw new Error('INGESTION_EMPTY_TEXT');
    const vectors = await this.embeddings.embed(
      chunks.map((chunk) => chunk.chunkContent),
      undefined,
      signal,
    );
    signal.throwIfAborted();
    if (
      vectors.length !== chunks.length ||
      vectors.some((embedding) => embedding.length !== 1536)
    ) {
      throw new Error('INGESTION_INVALID_EMBEDDING');
    }
    await this.gateway.clearChunks(job);
    for (let offset = 0; offset < chunks.length; offset += 25) {
      signal.throwIfAborted();
      await this.gateway.insertChunks(
        chunks.slice(offset, offset + 25).map((chunk, index) => ({
          ...chunk,
          documentId: job.documentId,
          documentVersionId: job.documentVersionId,
          embedding: vectors[offset + index],
        })),
      );
      signal.throwIfAborted();
      await this.gateway.refreshLease(job, leaseSeconds);
    }
    signal.throwIfAborted();
    await this.gateway.complete(
      job,
      format === 'pdf'
        ? Math.max(...pages.map((page) => page.pageNumber))
        : null,
    );
  }

  /**
   * El sidecar es opcional y no confiable: si no existe, está deshabilitado,
   * excede el tope o no trae marcadores de página válidos, se ignora sin
   * afectar el trabajo. Nunca reemplaza al PDF como fuente de la cita.
   */
  private async extractMineruSidecar(
    job: ClaimedIngestionJob,
    signal: AbortSignal,
  ): Promise<ExtractedPage[] | null> {
    if (this.config.get<boolean>('RAG_MINERU_SIDECAR_ENABLED') === false) {
      return null;
    }
    if (!this.gateway.downloadOptionalObject) return null;
    try {
      const sidecar = await this.gateway.downloadOptionalObject(
        job.storageBucket,
        `${job.storagePath}${MINERU_SIDECAR_SUFFIX}`,
      );
      signal.throwIfAborted();
      if (!sidecar?.length || sidecar.length > MAX_MINERU_SIDECAR_BYTES) {
        return null;
      }
      const pages = this.mineru.extract(
        sidecar.toString('utf8'),
        job.pageCount,
      );
      if (!pages) {
        this.logger.warn(
          `MinerU sidecar inválido para el job ${job.jobId}; se usa la extracción PDF.`,
        );
      }
      return pages;
    } catch (error) {
      if (signal.aborted) throw error;
      this.logger.warn(
        `No se pudo leer el MinerU sidecar del job ${job.jobId}; se usa la extracción PDF.`,
      );
      return null;
    }
  }

  private async extractPages(
    format: IngestionFormat,
    file: Buffer,
    job: ClaimedIngestionJob,
    signal: AbortSignal,
  ): Promise<ExtractedPage[]> {
    if (format === 'docx') {
      return [{ pageNumber: 1, text: await this.docx.extract(file) }];
    }
    if (format === 'md') {
      // Fail-closed: un binario mal clasificado como 'md' NO debe decodificarse
      // como texto e indexarse como basura en el índice evidence-only.
      if (!isProbablyText(file)) {
        throw new Error('INGESTION_UNSUPPORTED_FORMAT');
      }
      const text = file.toString('utf8').trim();
      if (text.length > MAX_EXTRACTED_CHARS) {
        throw new Error('INGESTION_DOCUMENT_TOO_LARGE');
      }
      return [{ pageNumber: 1, text }];
    }
    if (format === 'doc') {
      // .doc heredado (OLE2) no tiene extractor: se rechaza de forma explícita
      // en vez de intentar parsearlo como PDF y fallar de forma opaca.
      throw new Error('INGESTION_UNSUPPORTED_FORMAT');
    }

    // MinerU no se ejecuta dentro de la API (el runtime de Render no tiene sus
    // modelos ni memoria para ellos). Si un operador ya convirtió el PDF, el
    // Markdown sidecar aporta tablas y estructura por página; si falta o es
    // inválido, se conserva exactamente la extracción PDF anterior.
    const mineruPages = await this.extractMineruSidecar(job, signal);
    if (mineruPages) return mineruPages;

    // PDF: extracción por página + OCR local de páginas casi vacías, con guardas
    // de memoria para Render Free (512 MB): tope de páginas, lotes de render y un
    // único worker Tesseract reutilizado por trabajo.
    const pages = await this.pdf.extract(file);
    signal.throwIfAborted();
    // Los PDFs grandes omiten el conteo durante la carga para no duplicar una
    // extracción costosa. La ingesta aplica el mismo límite en cuanto conoce
    // el total, antes de OCR, embeddings y escrituras parciales.
    if (pages.length > MAX_PDF_PAGES) {
      throw new Error('INGESTION_DOCUMENT_TOO_LARGE');
    }
    const sparsePages = pages
      .filter((page) => page.text.replace(/\s/g, '').length < 50)
      .map((page) => page.pageNumber);
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
          signal.throwIfAborted();
          const batch = sparse.slice(offset, offset + OCR_RENDER_BATCH);
          const images = await this.pdf.render(file, batch);
          signal.throwIfAborted();
          for (const pageNumber of batch) {
            const image = images.get(pageNumber);
            const page = pageByNumber.get(pageNumber);
            if (image && page) page.text = await recognize(image);
            images.delete(pageNumber);
          }
        }
      }, signal);
    }
    return pages;
  }
}
