import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { DocumentRelationsController } from './document-relations.controller';
import { DocumentRelationsService } from './document-relations.service';
import { OpenAiAnswerGateway } from './openai-answer.gateway';
import { RagService } from './rag.service';
import { RetrievalContractProbe } from './retrieval-contract.probe';
import { RAG_ANSWER_GATEWAY } from './rag.tokens';

@Module({
  imports: [AuthorizationModule, IngestionModule, SupabaseModule],
  controllers: [DocumentRelationsController],
  providers: [
    OpenAiAnswerGateway,
    RagService,
    RetrievalContractProbe,
    DocumentRelationsService,
    { provide: RAG_ANSWER_GATEWAY, useExisting: OpenAiAnswerGateway },
  ],
  exports: [
    RagService,
    RetrievalContractProbe,
    RAG_ANSWER_GATEWAY,
    DocumentRelationsService,
  ],
})
export class RagModule {}
