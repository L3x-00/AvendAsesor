import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { IngestionService } from './ingestion.service';

@Injectable()
export class IngestionWorker implements OnModuleInit {
  private readonly logger = new Logger(IngestionWorker.name);

  constructor(
    private readonly config: ConfigService,
    private readonly ingestion: IngestionService,
  ) {}

  /**
   * Sin este aviso el worker apagado es indistinguible de uno que funciona: los
   * PDF se quedan en `pending` para siempre, el chat responde "sin evidencia" y
   * nada en los registros lo explica. Ya costó meses de documentos sin indexar.
   */
  onModuleInit(): void {
    if (this.config.get<boolean>('RAG_INGESTION_WORKER_ENABLED')) {
      this.logger.log(
        'Ingestion worker enabled; polling for pending document versions.',
      );
      return;
    }

    this.logger.warn(
      'Ingestion worker is DISABLED (RAG_INGESTION_WORKER_ENABLED is not "true"). ' +
        'Uploaded PDFs will stay pending and will never become searchable evidence.',
    );
  }

  /**
   * `@Interval` no espera a la promesa anterior: sin esta guarda, cada 5 s
   * arrancaba otro trabajo en paralelo (con su OCR) y, en Render Free, el
   * proceso se quedaba sin memoria. Los trabajos perdían su turno y terminaban
   * en Error con LEASE_EXPIRED (seis documentos en producción, 2026-09-29/30).
   */
  private running = false;

  @Interval(5000)
  async poll(): Promise<void> {
    if (!this.config.get<boolean>('RAG_INGESTION_WORKER_ENABLED')) return;
    if (this.running) return;
    this.running = true;
    try {
      await this.ingestion.processNext();
    } catch (error) {
      this.logger.error(
        `Ingestion polling failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
