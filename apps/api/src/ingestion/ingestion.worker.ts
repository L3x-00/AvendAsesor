import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { IngestionService } from './ingestion.service';

@Injectable()
export class IngestionWorker {
  constructor(
    private readonly config: ConfigService,
    private readonly ingestion: IngestionService,
  ) {}
  @Interval(5000)
  async poll(): Promise<void> {
    if (this.config.get<boolean>('RAG_INGESTION_WORKER_ENABLED'))
      await this.ingestion.processNext();
  }
}
