import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { PdfInspectionService } from './pdf-inspection.service';

@Module({
  imports: [AuthorizationModule, SupabaseModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, PdfInspectionService],
})
export class DocumentsModule {}
