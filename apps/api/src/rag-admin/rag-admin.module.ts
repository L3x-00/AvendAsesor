import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { RagReadinessController } from './rag-readiness.controller';
import { RagReadinessService } from './rag-readiness.service';

@Module({
  imports: [AuthorizationModule, SupabaseModule],
  controllers: [RagReadinessController],
  providers: [RagReadinessService],
})
export class RagAdminModule {}
