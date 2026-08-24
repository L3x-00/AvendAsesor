import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { LearningModule } from '../learning/learning.module';
import { RagModule } from '../rag/rag.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [AuthorizationModule, LearningModule, RagModule, SupabaseModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
