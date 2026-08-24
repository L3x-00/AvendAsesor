import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { HealthController } from './health.controller';
import { ReadinessService } from './readiness.service';
import { HealthService } from './health.service';

@Module({
  imports: [SupabaseModule],
  controllers: [HealthController],
  providers: [HealthService, ReadinessService],
})
export class HealthModule {}
