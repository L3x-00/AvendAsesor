import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { AttachmentInspectionService } from './attachment-inspection.service';
import {
  AdminConsultationCasesController,
  TeacherConsultationCasesController,
} from './consultation-cases.controller';
import { ConsultationCasesService } from './consultation-cases.service';

@Module({
  imports: [AuthorizationModule, SupabaseModule],
  controllers: [
    TeacherConsultationCasesController,
    AdminConsultationCasesController,
  ],
  providers: [AttachmentInspectionService, ConsultationCasesService],
})
export class ConsultationCasesModule {}
