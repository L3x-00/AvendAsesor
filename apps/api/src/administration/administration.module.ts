import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { AdministrationController } from './administration.controller';
import { AdministrationService } from './administration.service';

@Module({
  imports: [AuthorizationModule, SupabaseModule],
  controllers: [AdministrationController],
  providers: [AdministrationService],
})
export class AdministrationModule {}
