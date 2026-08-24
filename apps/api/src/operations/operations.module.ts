import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [AuthorizationModule, SupabaseModule],
  controllers: [OperationsController],
  providers: [OperationsService],
})
export class OperationsModule {}
