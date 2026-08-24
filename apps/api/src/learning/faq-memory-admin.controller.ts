import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AuthorizationGuard,
  CurrentAuthorization,
  RequireRoles,
  RolesGuard,
  type AuthorizationContext,
} from '../authorization';
import { ListFaqMemoryCandidatesQueryDto } from './dto/list-faq-memory-candidates-query.dto';
import { ReviewFaqMemoryCandidateDto } from './dto/review-faq-memory-candidate.dto';
import type {
  FaqMemoryCandidate,
  FaqMemoryQualitySummary,
} from './faq-memory.gateway';
import { FaqMemoryAdminService } from './faq-memory-admin.service';

@Controller('admin/rag/faq-memory')
@UseGuards(ThrottlerGuard, AuthorizationGuard, RolesGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@RequireRoles('admin', 'superadmin')
export class FaqMemoryAdminController {
  constructor(private readonly faqMemoryAdminService: FaqMemoryAdminService) {}

  @Get('quality-summary')
  getQualitySummary(
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<FaqMemoryQualitySummary> {
    return this.faqMemoryAdminService.getQualitySummary(authorization);
  }

  @Get('candidates')
  listCandidates(
    @Query() dto: ListFaqMemoryCandidatesQueryDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<FaqMemoryCandidate[]> {
    return this.faqMemoryAdminService.listCandidates(dto, authorization);
  }

  @Patch('candidates/:id/review')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reviewCandidate(
    @Param('id', new ParseUUIDPipe({ version: '4' })) candidateId: string,
    @Body() dto: ReviewFaqMemoryCandidateDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<void> {
    await this.faqMemoryAdminService.reviewCandidate(
      candidateId,
      dto,
      authorization,
    );
  }
}
