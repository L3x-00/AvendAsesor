import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AuthorizationGuard,
  CurrentAuthorization,
  RequireRoles,
  RolesGuard,
  type AuthorizationContext,
} from '../authorization';
import { MAX_CONSULTATION_ATTACHMENT_BYTES } from './attachment-inspection.service';
import { ConsultationAttachmentMulterExceptionFilter } from './consultation-attachment-multer.filter';
import { ConsultationCasesService } from './consultation-cases.service';
import { CreateTeacherReportDto } from './dto/create-teacher-report.dto';
import { CreateTeacherSuggestionDto } from './dto/create-teacher-suggestion.dto';
import { ConsultationPeriodQueryDto } from './dto/consultation-period-query.dto';
import { ConsultationAttachmentAccessQueryDto } from './dto/consultation-attachment-access-query.dto';
import { DecideConsultationAttachmentDto } from './dto/decide-consultation-attachment.dto';
import { LinkConsultationCaseDocumentDto } from './dto/link-consultation-case-document.dto';
import { ListConsultationCasesQueryDto } from './dto/list-consultation-cases-query.dto';
import { UpdateConsultationCaseDto } from './dto/update-consultation-case.dto';
import type {
  ConsultationCaseDetail,
  ConsultationCaseSummary,
  ConsultationReportsDashboard,
  ConsultationReviewPriority,
  ConsultationTopic,
} from './consultation-cases.gateway';

@Controller('consultation-cases')
@UseGuards(ThrottlerGuard, AuthorizationGuard, RolesGuard)
@UseFilters(ConsultationAttachmentMulterExceptionFilter)
@RequireRoles('docente', 'admin', 'superadmin')
@Throttle({ default: { limit: 12, ttl: 60_000 } })
export class TeacherConsultationCasesController {
  constructor(private readonly service: ConsultationCasesService) {}

  @Post('reports')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_CONSULTATION_ATTACHMENT_BYTES, files: 1 },
    }),
  )
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  createReport(
    @Body() dto: CreateTeacherReportDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<{ caseId: string }> {
    return this.service.createTeacherReport({
      answerMessageId: dto.answerMessageId,
      comment: dto.comment,
      file,
      reason: dto.reason,
      submissionId: dto.submissionId,
      userId: authorization.userId,
    });
  }

  @Post('suggestions')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_CONSULTATION_ATTACHMENT_BYTES, files: 1 },
    }),
  )
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  createSuggestion(
    @Body() dto: CreateTeacherSuggestionDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<{ caseId: string }> {
    return this.service.createTeacherSuggestion({
      comment: dto.comment,
      conversationId: dto.conversationId,
      file,
      submissionId: dto.submissionId,
      userId: authorization.userId,
    });
  }
}

@Controller('admin/consultation-cases')
@UseGuards(ThrottlerGuard, AuthorizationGuard, RolesGuard)
@RequireRoles('admin', 'superadmin')
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class AdminConsultationCasesController {
  constructor(private readonly service: ConsultationCasesService) {}

  @Get('dashboard')
  getDashboard(
    @Query() dto: ConsultationPeriodQueryDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<ConsultationReportsDashboard> {
    return this.service.getDashboard(
      authorization.userId,
      dto.period ?? 'month',
    );
  }

  @Get('dashboard/review-priorities')
  getReviewPriorities(
    @Query() dto: ConsultationPeriodQueryDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<ConsultationReviewPriority[]> {
    return this.service.getReviewPriorities(
      authorization.userId,
      dto.period ?? 'month',
    );
  }

  @Get('dashboard/topics')
  getTopics(
    @Query() dto: ConsultationPeriodQueryDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<ConsultationTopic[]> {
    return this.service.getTopics(authorization.userId, dto.period ?? 'month');
  }

  @Get()
  listCases(
    @Query() dto: ListConsultationCasesQueryDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<ConsultationCaseSummary[]> {
    return this.service.listCases({
      issueType: dto.issueType,
      kind: dto.kind,
      limit: dto.limit ?? 50,
      moduleId: dto.moduleId,
      offset: dto.offset ?? 0,
      period: dto.period ?? 'month',
      query: dto.query?.trim() || undefined,
      reviewerId: authorization.userId,
      status: dto.status,
      submoduleId: dto.submoduleId,
    });
  }

  @Get(':caseId')
  getCaseDetail(
    @Param('caseId', new ParseUUIDPipe({ version: '4' })) caseId: string,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<ConsultationCaseDetail> {
    return this.service.getCaseDetail(authorization.userId, caseId);
  }

  @Patch(':caseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateCase(
    @Param('caseId', new ParseUUIDPipe({ version: '4' })) caseId: string,
    @Body() dto: UpdateConsultationCaseDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<void> {
    await this.service.updateCase({
      ...dto,
      caseId,
      reviewerId: authorization.userId,
    });
  }

  @Post(':caseId/documents')
  @HttpCode(HttpStatus.NO_CONTENT)
  async linkDocument(
    @Param('caseId', new ParseUUIDPipe({ version: '4' })) caseId: string,
    @Body() dto: LinkConsultationCaseDocumentDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<void> {
    await this.service.linkDocument(
      authorization.userId,
      caseId,
      dto.documentId,
    );
  }

  @Post(':caseId/attachments/:attachmentId/decision')
  @HttpCode(HttpStatus.NO_CONTENT)
  async decideAttachment(
    @Param('caseId', new ParseUUIDPipe({ version: '4' })) caseId: string,
    @Param('attachmentId', new ParseUUIDPipe({ version: '4' }))
    attachmentId: string,
    @Body() dto: DecideConsultationAttachmentDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<void> {
    await this.service.decideAttachment({
      attachmentId,
      caseId,
      disposition: dto.disposition,
      documentId: dto.documentId,
      note: dto.note,
      reviewerId: authorization.userId,
    });
  }

  @Post(':caseId/attachments/:attachmentId/download-url')
  createAttachmentDownloadUrl(
    @Param('caseId', new ParseUUIDPipe({ version: '4' })) caseId: string,
    @Param('attachmentId', new ParseUUIDPipe({ version: '4' }))
    attachmentId: string,
    @Query() dto: ConsultationAttachmentAccessQueryDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<{ expiresAt: string; url: string }> {
    return this.service.createAttachmentDownloadUrl(
      authorization.userId,
      caseId,
      attachmentId,
      dto.mode ?? 'download',
    );
  }
}
