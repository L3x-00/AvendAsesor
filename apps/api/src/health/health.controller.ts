import { Controller, Get } from '@nestjs/common';
import {
  HealthService,
  type HealthReadinessStatus,
  type HealthStatus,
} from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getStatus(): HealthStatus {
    return this.healthService.getStatus();
  }

  @Get('ready')
  getReadiness(): Promise<HealthReadinessStatus> {
    return this.healthService.getReadiness();
  }
}
