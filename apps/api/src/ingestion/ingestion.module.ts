import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { ChunkingService } from './chunking.service';
import { DocxExtractionService } from './docx-extraction.service';
import { EMBEDDINGS_GATEWAY } from './ingestion.tokens';
import { IngestionService } from './ingestion.service';
import { IngestionWorker } from './ingestion.worker';
import { OcrService } from './ocr.service';
import { OpenAiEmbeddingsGateway } from './openai-embeddings.gateway';
import { PdfExtractionService } from './pdf-extraction.service';

@Module({
  imports: [SupabaseModule],
  providers: [
    ChunkingService,
    DocxExtractionService,
    IngestionService,
    IngestionWorker,
    OcrService,
    OpenAiEmbeddingsGateway,
    PdfExtractionService,
    { provide: EMBEDDINGS_GATEWAY, useExisting: OpenAiEmbeddingsGateway },
  ],
  exports: [ChunkingService, EMBEDDINGS_GATEWAY, IngestionService],
})
export class IngestionModule {}
