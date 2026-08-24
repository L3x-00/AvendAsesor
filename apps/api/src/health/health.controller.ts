import { Controller, Get } from '@nestjs/common';
import { HealthService, type HealthStatus } from './health.service';
import { ReadinessService, type ReadinessStatus } from './readiness.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly readinessService: ReadinessService,
  ) {}

  @Get()
  getStatus(): HealthStatus {
    return this.healthService.getStatus();
  }

  @Get('ready')
  getReadiness(): Promise<ReadinessStatus> {
    return this.readinessService.getStatus();
  }
}
