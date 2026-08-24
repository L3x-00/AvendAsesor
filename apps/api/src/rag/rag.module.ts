import { Module } from '@nestjs/common';
import { IngestionModule } from '../ingestion/ingestion.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { OpenAiAnswerGateway } from './openai-answer.gateway';
import { RagService } from './rag.service';
import { RAG_ANSWER_GATEWAY } from './rag.tokens';

@Module({
  imports: [IngestionModule, SupabaseModule],
  providers: [
    OpenAiAnswerGateway,
    RagService,
    { provide: RAG_ANSWER_GATEWAY, useExisting: OpenAiAnswerGateway },
  ],
  exports: [RagService, RAG_ANSWER_GATEWAY],
})
export class RagModule {}
