import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { UserAdministrationController } from './user-administration.controller';
import { UserAdministrationService } from './user-administration.service';

@Module({
  imports: [AuthorizationModule, SupabaseModule],
  controllers: [UserAdministrationController],
  providers: [UserAdministrationService],
})
export class UserAdministrationModule {}
