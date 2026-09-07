import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { SUPABASE_CONSULTATION_CASES_GATEWAY } from '../supabase/supabase.constants';
import { AttachmentInspectionService } from './attachment-inspection.service';
import type {
  ConsultationAttachmentDisposition,
  ConsultationCaseDetail,
  ConsultationCaseIssue,
  ConsultationCaseKind,
  ConsultationCaseStatus,
  ConsultationCasesGateway,
  ConsultationPeriod,
  ConsultationReportReason,
  ConsultationReportsDashboard,
  ConsultationReviewPriority,
  ConsultationTopic,
  ConsultationCaseSummary,
} from './consultation-cases.gateway';

@Injectable()
export class ConsultationCasesService {
  constructor(
    @Inject(SUPABASE_CONSULTATION_CASES_GATEWAY)
    private readonly gateway: ConsultationCasesGateway,
    private readonly attachments: AttachmentInspectionService,
  ) {}

  async createTeacherReport(input: {
    answerMessageId: string;
    comment?: string;
    file?: Express.Multer.File;
    reason: ConsultationReportReason;
    submissionId: string;
    userId: string;
  }): Promise<{ caseId: string }> {
    return this.createTeacherCaseWithAttachment({
      answerMessageId: input.answerMessageId,
      comment: input.comment ?? null,
      conversationId: null,
      file: input.file,
      kind: 'teacher_report',
      reportReason: input.reason,
      submissionId: input.submissionId,
      userId: input.userId,
    });
  }

  async createTeacherSuggestion(input: {
    comment: string;
    conversationId?: string;
    file?: Express.Multer.File;
    submissionId: string;
    userId: string;
  }): Promise<{ caseId: string }> {
    return this.createTeacherCaseWithAttachment({
      answerMessageId: null,
      comment: input.comment,
      conversationId: input.conversationId ?? null,
      file: input.file,
      kind: 'teacher_suggestion',
      reportReason: null,
      submissionId: input.submissionId,
      userId: input.userId,
    });
  }

  getDashboard(
    reviewerId: string,
    period: ConsultationPeriod,
  ): Promise<ConsultationReportsDashboard> {
    return this.gateway.getDashboard({ period, reviewerId });
  }

  getReviewPriorities(
    reviewerId: string,
    period: ConsultationPeriod,
  ): Promise<ConsultationReviewPriority[]> {
    return this.gateway.getReviewPriorities({
      limit: 5,
      period,
      reviewerId,
    });
  }

  getTopics(
    reviewerId: string,
    period: ConsultationPeriod,
  ): Promise<ConsultationTopic[]> {
    return this.gateway.getTopics({
      limit: 5,
      period,
      reviewerId,
    });
  }

  listCases(input: {
    issueType?: ConsultationCaseIssue;
    kind?: ConsultationCaseKind;
    limit: number;
    moduleId?: string;
    offset: number;
    period: ConsultationPeriod;
    query?: string;
    reviewerId: string;
    status?: ConsultationCaseStatus;
    submoduleId?: string;
  }): Promise<ConsultationCaseSummary[]> {
    return this.gateway.listCases(input);
  }

  getCaseDetail(
    reviewerId: string,
    caseId: string,
  ): Promise<ConsultationCaseDetail> {
    return this.gateway.getCaseDetail({ caseId, reviewerId });
  }

  updateCase(input: {
    caseId: string;
    changeRouting?: boolean;
    detectedModuleId?: string | null;
    detectedSubmoduleId?: string | null;
    note?: string;
    reviewerId: string;
    status?: ConsultationCaseStatus;
  }): Promise<void> {
    const changeRouting = input.changeRouting === true;
    if (!changeRouting && !input.status && !input.note?.trim()) {
      throw new BadRequestException(
        'A case update needs a status, note or route correction.',
      );
    }
    return this.gateway.updateCase({
      caseId: input.caseId,
      changeRouting,
      detectedModuleId: changeRouting ? (input.detectedModuleId ?? null) : null,
      detectedSubmoduleId: changeRouting
        ? (input.detectedSubmoduleId ?? null)
        : null,
      note: input.note?.trim() || null,
      reviewerId: input.reviewerId,
      status: input.status ?? null,
    });
  }

  linkDocument(
    reviewerId: string,
    caseId: string,
    documentId: string,
  ): Promise<void> {
    return this.gateway.linkDocument({ caseId, documentId, reviewerId });
  }

  unlinkDocument(
    reviewerId: string,
    caseId: string,
    documentId: string,
  ): Promise<void> {
    return this.gateway.unlinkDocument({ caseId, documentId, reviewerId });
  }

  decideAttachment(input: {
    attachmentId: string;
    caseId: string;
    disposition: Exclude<ConsultationAttachmentDisposition, 'pending_review'>;
    documentId?: string;
    note?: string;
    reviewerId: string;
  }): Promise<void> {
    return this.gateway.decideAttachment({
      attachmentId: input.attachmentId,
      caseId: input.caseId,
      disposition: input.disposition,
      documentId: input.documentId ?? null,
      note: input.note?.trim() || null,
      reviewerId: input.reviewerId,
    });
  }

  createAttachmentDownloadUrl(
    reviewerId: string,
    caseId: string,
    attachmentId: string,
    mode: 'view' | 'download',
  ): Promise<{ expiresAt: string; url: string }> {
    return this.gateway.createAttachmentDownloadUrl({
      attachmentId,
      caseId,
      download: mode === 'download',
      reviewerId,
      ttlSeconds: 60,
    });
  }

  private async createTeacherCaseWithAttachment(input: {
    answerMessageId: string | null;
    comment: string | null;
    conversationId: string | null;
    file?: Express.Multer.File;
    kind: 'teacher_report' | 'teacher_suggestion';
    reportReason: ConsultationReportReason | null;
    submissionId: string;
    userId: string;
  }): Promise<{ caseId: string }> {
    const attachmentKind =
      input.kind === 'teacher_report' ? 'report_image' : 'suggestion_file';
    const inspected = this.attachments.inspect(input.file, attachmentKind);
    const created = await this.gateway.createTeacherCase({
      answerMessageId: input.answerMessageId,
      comment: input.comment,
      conversationId: input.conversationId,
      kind: input.kind,
      reportReason: input.reportReason,
      submissionId: input.submissionId,
      userId: input.userId,
    });

    if (!inspected || !input.file) return created;

    await this.gateway.authorizeTeacherAttachment({
      attachmentKind,
      caseId: created.caseId,
      userId: input.userId,
    });
    const storagePath = `${created.caseId}/${inspected.sha256}.${inspected.extension}`;
    await this.gateway.uploadAttachment({
      content: input.file.buffer,
      mimeType: inspected.mimeType,
      storagePath,
    });

    try {
      await this.gateway.registerTeacherAttachment({
        attachmentKind,
        caseId: created.caseId,
        fileSizeBytes: inspected.fileSizeBytes,
        mimeType: inspected.mimeType,
        originalFileName: inspected.originalFileName,
        sha256: inspected.sha256,
        storagePath,
        userId: input.userId,
      });
    } catch (error) {
      await this.gateway.removeAttachment(storagePath).catch(() => undefined);
      throw error;
    }

    return created;
  }
}
