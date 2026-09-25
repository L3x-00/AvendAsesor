import { Controller, Get, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthorizationGuard, RequireRoles, RolesGuard } from '../authorization';
import {
  RagReadinessService,
  type RagReadiness,
} from './rag-readiness.service';

@Controller('admin/rag/readiness')
@UseGuards(ThrottlerGuard, AuthorizationGuard, RolesGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@RequireRoles('admin', 'superadmin')
export class RagReadinessController {
  constructor(private readonly readinessService: RagReadinessService) {}

  @Get()
  getReadiness(): Promise<RagReadiness> {
    return this.readinessService.getReadiness();
  }
}
