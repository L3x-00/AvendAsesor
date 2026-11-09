import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { RagModule } from '../rag/rag.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { RagReadinessController } from './rag-readiness.controller';
import { RagReadinessService } from './rag-readiness.service';

@Module({
  imports: [AuthorizationModule, IngestionModule, RagModule, SupabaseModule],
  controllers: [RagReadinessController],
  providers: [RagReadinessService],
  exports: [RagReadinessService],
})
export class RagAdminModule {}
