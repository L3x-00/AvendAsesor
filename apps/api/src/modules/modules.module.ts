import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { ModulesController } from './modules.controller';
import { ModulesService } from './modules.service';

@Module({
  imports: [AuthorizationModule, SupabaseModule],
  controllers: [ModulesController],
  providers: [ModulesService],
})
export class ModulesModule {}
