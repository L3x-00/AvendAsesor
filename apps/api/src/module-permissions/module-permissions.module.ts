import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization';
import { SupabaseModule } from '../supabase/supabase.module';
import { ModulePermissionsController } from './module-permissions.controller';
import { ModulePermissionsService } from './module-permissions.service';

@Module({
  controllers: [ModulePermissionsController],
  imports: [AuthorizationModule, SupabaseModule],
  providers: [ModulePermissionsService],
})
export class ModulePermissionsModule {}
