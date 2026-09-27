import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { LearningModule } from '../learning/learning.module';
import { RagModule } from '../rag/rag.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { ChatCatalogService } from './catalog/chat-catalog.service';
import {
  DOCUMENT_SUMMARY_GATEWAY,
  SUGGESTED_QUESTIONS_GATEWAY,
} from './catalog/chat-catalog.types';
import { OpenAiDocumentSummaryGateway } from './catalog/openai-document-summary.gateway';
import { OpenAiSuggestedQuestionsGateway } from './catalog/openai-suggested-questions.gateway';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [AuthorizationModule, LearningModule, RagModule, SupabaseModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatCatalogService,
    {
      provide: SUGGESTED_QUESTIONS_GATEWAY,
      useClass: OpenAiSuggestedQuestionsGateway,
    },
    {
      provide: DOCUMENT_SUMMARY_GATEWAY,
      useClass: OpenAiDocumentSummaryGateway,
    },
  ],
})
export class ChatModule {}
