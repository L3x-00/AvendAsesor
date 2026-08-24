import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { FaqMemoryAdminController } from './faq-memory-admin.controller';
import { FaqMemoryAdminService } from './faq-memory-admin.service';
import { FaqMemoryService } from './faq-memory.service';

@Module({
  imports: [AuthorizationModule, SupabaseModule],
  controllers: [FaqMemoryAdminController],
  providers: [FaqMemoryAdminService, FaqMemoryService],
  exports: [FaqMemoryService],
})
export class LearningModule {}
