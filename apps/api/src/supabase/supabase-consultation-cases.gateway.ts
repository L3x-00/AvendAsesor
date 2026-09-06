import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';
import type {
  ConsultationCaseDetail,
  ConsultationCaseSummary,
  ConsultationCasesGateway,
  ConsultationRanking,
  ConsultationReportsDashboard,
  ConsultationReviewPriority,
  ConsultationTopic,
} from '../consultation-cases/consultation-cases.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

const ATTACHMENT_BUCKET = 'consultation-case-attachments';

interface ConsultationCasesRpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: PostgrestError | null }>;
}

function databaseError(error: PostgrestError): never {
  if (error.code === '42501') {
    throw new ForbiddenException('Consultation-case access is denied.');
  }
  if (error.code === 'P0002') {
    throw new NotFoundException('The consultation case was not found.');
  }
  if (error.code === '22023' || error.code === '22P02') {
    throw new BadRequestException('The consultation-case request is invalid.');
  }
  if (
    error.code === '23503' ||
    error.code === '23505' ||
    error.code === '23514' ||
    error.code === 'P0001'
  ) {
    throw new ConflictException(
      'The consultation case conflicts with current data.',
    );
  }
  throw new ServiceUnavailableException(
    'Consultation-case data is temporarily unavailable.',
  );
}

function requireOne<T>(value: unknown, message: string): T {
  if (!Array.isArray(value) || !value[0]) {
    throw new ServiceUnavailableException(message);
  }
  return value[0] as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function rankings(value: unknown): ConsultationRanking[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.name !== 'string'
    ) {
      return [];
    }
    return [
      {
        count: numberValue(item.count),
        id: item.id,
        ...(typeof item.moduleId === 'string'
          ? { moduleId: item.moduleId }
          : {}),
        ...(typeof item.moduleName === 'string'
          ? { moduleName: item.moduleName }
          : {}),
        name: item.name,
      },
    ];
  });
}

function ranking(value: unknown): ConsultationRanking | null {
  return rankings(value ? [value] : [])[0] ?? null;
}

function asCaseSummary(row: Record<string, unknown>): ConsultationCaseSummary {
  return {
    answerSnapshot: stringOrNull(row.answer_snapshot),
    attachmentCount: numberValue(row.attachment_count),
    conversationId: stringOrNull(row.conversation_id),
    createdAt: String(row.created_at),
    detectedModuleId: stringOrNull(row.detected_module_id),
    detectedModuleName: stringOrNull(row.detected_module_name),
    detectedSubmoduleId: stringOrNull(row.detected_submodule_id),
    detectedSubmoduleName: stringOrNull(row.detected_submodule_name),
    id: String(row.id),
    issueType: String(row.issue_type) as ConsultationCaseSummary['issueType'],
    kind: String(row.kind) as ConsultationCaseSummary['kind'],
    linkedDocumentCount: numberValue(row.linked_document_count),
    questionSnapshot: stringOrNull(row.question_snapshot),
    reportReason: stringOrNull(
      row.report_reason,
    ) as ConsultationCaseSummary['reportReason'],
    reporterComment: stringOrNull(row.reporter_comment),
    requestedModuleId: stringOrNull(row.requested_module_id),
    requestedModuleName: stringOrNull(row.requested_module_name),
    reviewExcerpt: stringOrNull(row.review_excerpt),
    sourceCount: numberValue(row.source_count),
    status: String(row.status) as ConsultationCaseSummary['status'],
    topRelevanceScore: numberOrNull(row.top_relevance_score),
    totalCount: numberValue(row.total_count),
    updatedAt: String(row.updated_at),
  };
}

function parseCaseDetail(value: unknown): ConsultationCaseDetail {
  if (!isRecord(value) || !isRecord(value.case)) {
    throw new ServiceUnavailableException(
      'The consultation case detail is unavailable.',
    );
  }
  const row = value.case;
  const toItems = (key: string): Record<string, unknown>[] =>
    Array.isArray(value[key]) ? value[key].filter(isRecord) : [];
  const summary = asCaseSummary({
    answer_snapshot: row.answerSnapshot,
    attachment_count: 0,
    conversation_id: row.conversationId,
    created_at: row.createdAt,
    detected_module_id: row.detectedModuleId,
    detected_module_name: row.detectedModuleName,
    detected_submodule_id: row.detectedSubmoduleId,
    detected_submodule_name: row.detectedSubmoduleName,
    id: row.id,
    issue_type: row.issueType,
    kind: row.kind,
    linked_document_count: 0,
    question_snapshot: row.questionSnapshot,
    report_reason: row.reportReason,
    reporter_comment: row.reporterComment,
    requested_module_id: row.requestedModuleId,
    requested_module_name: row.requestedModuleName,
    review_excerpt: row.reviewExcerpt,
    source_count: 0,
    status: row.status,
    top_relevance_score: row.topRelevanceScore,
    total_count: 0,
    updated_at: row.updatedAt,
  });
  const caseSummary = {
    answerSnapshot: summary.answerSnapshot,
    conversationId: summary.conversationId,
    createdAt: summary.createdAt,
    detectedModuleId: summary.detectedModuleId,
    detectedModuleName: summary.detectedModuleName,
    detectedSubmoduleId: summary.detectedSubmoduleId,
    detectedSubmoduleName: summary.detectedSubmoduleName,
    id: summary.id,
    issueType: summary.issueType,
    kind: summary.kind,
    questionSnapshot: summary.questionSnapshot,
    reportReason: summary.reportReason,
    reporterComment: summary.reporterComment,
    requestedModuleId: summary.requestedModuleId,
    requestedModuleName: summary.requestedModuleName,
    reviewExcerpt: summary.reviewExcerpt,
    status: summary.status,
    topRelevanceScore: summary.topRelevanceScore,
    updatedAt: summary.updatedAt,
  };

  return {
    attachments: toItems('attachments').map((item) => ({
      attachmentKind: String(item.attachmentKind) as
        'report_image' | 'suggestion_file',
      createdAt: String(item.createdAt),
      disposition: String(
        item.disposition,
      ) as ConsultationCaseDetail['attachments'][number]['disposition'],
      fileSizeBytes: numberValue(item.fileSizeBytes),
      id: String(item.id),
      incorporatedDocumentId: stringOrNull(item.incorporatedDocumentId),
      mimeType: String(item.mimeType),
      originalFileName: String(item.originalFileName),
      sha256: String(item.sha256),
    })),
    case: {
      ...caseSummary,
      consultationTurnId: stringOrNull(row.consultationTurnId),
      retrievalScope: stringOrNull(
        row.retrievalScope,
      ) as ConsultationCaseDetail['case']['retrievalScope'],
      snapshotComplete: row.snapshotComplete === true,
    },
    events: toItems('events').map((item) => ({
      actorId: stringOrNull(item.actorId),
      actorName: stringOrNull(item.actorName),
      createdAt: String(item.createdAt),
      eventType: String(item.eventType),
      id: String(item.id),
      metadata: isRecord(item.metadata) ? item.metadata : {},
      note: stringOrNull(item.note),
    })),
    linkedDocuments: toItems('linkedDocuments').map((item) => ({
      id: String(item.id),
      linkedAt: String(item.linkedAt),
      linkedBy: String(item.linkedBy),
      publicationStatus: String(item.publicationStatus) as
        'active' | 'inactive',
      situation: String(item.situation) as 'archived' | 'current' | 'replaced',
      title: String(item.title),
    })),
    sources: toItems('sources').map((item) => ({
      articleReference: stringOrNull(item.articleReference),
      documentId: stringOrNull(item.documentId),
      documentSituation: String(item.documentSituation) as
        'archived' | 'current' | 'replaced',
      documentTitle: String(item.documentTitle),
      documentVersionId: stringOrNull(item.documentVersionId),
      evidenceExcerpt: stringOrNull(item.evidenceExcerpt),
      id: String(item.id),
      numeralReference: stringOrNull(item.numeralReference),
      pageEnd: numberValue(item.pageEnd),
      pageStart: numberValue(item.pageStart),
      relevanceScore: numberValue(item.relevanceScore),
      rootModuleId: stringOrNull(item.rootModuleId),
      sectionTitle: stringOrNull(item.sectionTitle),
      sourceRank: numberValue(item.sourceRank),
      submoduleId: stringOrNull(item.submoduleId),
      versionNumber: numberValue(item.versionNumber),
    })),
  };
}

@Injectable()
export class SupabaseConsultationCasesGatewayAdapter implements ConsultationCasesGateway {
  constructor(private readonly client: SupabaseServerClient | null) {}

  async createTeacherCase(
    input: Parameters<ConsultationCasesGateway['createTeacherCase']>[0],
  ): Promise<{ caseId: string }> {
    const { data, error } = await this.rpc().rpc(
      'create_teacher_consultation_case',
      {
        p_answer_message_id: input.answerMessageId,
        p_client_submission_id: input.submissionId,
        p_comment: input.comment,
        p_conversation_id: input.conversationId,
        p_kind: input.kind,
        p_report_reason: input.reportReason,
        p_user_id: input.userId,
      },
    );
    if (error) databaseError(error);
    const result = requireOne<{ consultation_case_id: string }>(
      data,
      'The consultation case could not be created.',
    );
    return { caseId: result.consultation_case_id };
  }

  async authorizeTeacherAttachment(
    input: Parameters<
      ConsultationCasesGateway['authorizeTeacherAttachment']
    >[0],
  ): Promise<void> {
    const { error } = await this.rpc().rpc(
      'authorize_teacher_consultation_case_attachment',
      {
        p_attachment_kind: input.attachmentKind,
        p_consultation_case_id: input.caseId,
        p_user_id: input.userId,
      },
    );
    if (error) databaseError(error);
  }

  async registerTeacherAttachment(
    input: Parameters<ConsultationCasesGateway['registerTeacherAttachment']>[0],
  ): Promise<{ attachmentId: string }> {
    const { data, error } = await this.rpc().rpc(
      'register_teacher_consultation_case_attachment',
      {
        p_attachment_kind: input.attachmentKind,
        p_consultation_case_id: input.caseId,
        p_file_size_bytes: input.fileSizeBytes,
        p_mime_type: input.mimeType,
        p_original_file_name: input.originalFileName,
        p_sha256: input.sha256,
        p_storage_path: input.storagePath,
        p_user_id: input.userId,
      },
    );
    if (error) databaseError(error);
    const result = requireOne<{ attachment_id: string }>(
      data,
      'The consultation attachment could not be registered.',
    );
    return { attachmentId: result.attachment_id };
  }

  async uploadAttachment(
    input: Parameters<ConsultationCasesGateway['uploadAttachment']>[0],
  ): Promise<void> {
    const { error } = await this.requireClient()
      .storage.from(ATTACHMENT_BUCKET)
      .upload(input.storagePath, input.content, {
        contentType: input.mimeType,
        upsert: true,
      });
    if (error) {
      throw new ServiceUnavailableException(
        'The consultation attachment could not be stored.',
      );
    }
  }

  async removeAttachment(storagePath: string): Promise<void> {
    const { error } = await this.requireClient()
      .storage.from(ATTACHMENT_BUCKET)
      .remove([storagePath]);
    if (error) {
      throw new ServiceUnavailableException(
        'The consultation attachment cleanup failed.',
      );
    }
  }

  async getDashboard(
    input: Parameters<ConsultationCasesGateway['getDashboard']>[0],
  ): Promise<ConsultationReportsDashboard> {
    const { data, error } = await this.rpc().rpc(
      'get_consultation_reports_dashboard',
      {
        p_actor_id: input.reviewerId,
        p_period: input.period,
      },
    );
    if (error) databaseError(error);
    const row = requireOne<Record<string, unknown>>(
      data,
      'Consultation report metrics are unavailable.',
    );
    return {
      answersWithIncidents: numberValue(row.answers_with_incidents),
      consultationModules: rankings(row.consultation_modules),
      consultationSubmodules: rankings(row.consultation_submodules),
      documentsSuggested: numberValue(row.documents_suggested),
      incidentModules: rankings(row.incident_modules),
      incidentSubmodules: rankings(row.incident_submodules),
      noSupport: numberValue(row.no_support),
      period: String(row.period) as ConsultationReportsDashboard['period'],
      periodEnd: String(row.period_end),
      periodStart: String(row.period_start),
      teacherReports: numberValue(row.teacher_reports),
      teacherSuggestions: numberValue(row.teacher_suggestions),
      topConsultedModule: ranking(row.top_consulted_module),
      topConsultedSubmodule: ranking(row.top_consulted_submodule),
      topIncidentModule: ranking(row.top_incident_module),
      topIncidentSubmodule: ranking(row.top_incident_submodule),
      totalQuestions: numberValue(row.total_questions),
    };
  }

  async getReviewPriorities(
    input: Parameters<ConsultationCasesGateway['getReviewPriorities']>[0],
  ): Promise<ConsultationReviewPriority[]> {
    const { data, error } = await this.rpc().rpc(
      'list_consultation_review_priorities',
      {
        p_actor_id: input.reviewerId,
        p_limit: input.limit,
        p_period: input.period,
      },
    );
    if (error) databaseError(error);
    if (!Array.isArray(data)) return [];

    return data.filter(isRecord).flatMap((row) => {
      const priority = String(row.priority);
      const issueTypes = Array.isArray(row.issue_types)
        ? row.issue_types.filter(
            (issueType): issueType is string => typeof issueType === 'string',
          )
        : [];
      if (
        (priority !== 'critical' &&
          priority !== 'high' &&
          priority !== 'medium') ||
        issueTypes.length === 0
      ) {
        return [];
      }
      return [
        {
          answerSnapshot: stringOrNull(row.answer_snapshot),
          answerMessageId: String(row.answer_message_id),
          caseId: String(row.case_id),
          createdAt: String(row.created_at),
          detectedModuleName: stringOrNull(row.detected_module_name),
          detectedSubmoduleName: stringOrNull(row.detected_submodule_name),
          issueTypes: issueTypes as ConsultationReviewPriority['issueTypes'],
          openCaseCount: numberValue(row.open_case_count),
          priority,
          questionSnapshot: stringOrNull(row.question_snapshot),
          reviewExcerpt: stringOrNull(row.review_excerpt),
        },
      ];
    });
  }

  async getTopics(
    input: Parameters<ConsultationCasesGateway['getTopics']>[0],
  ): Promise<ConsultationTopic[]> {
    const { data, error } = await this.rpc().rpc('list_consultation_topics', {
      p_actor_id: input.reviewerId,
      p_limit: input.limit,
      p_period: input.period,
    });
    if (error) databaseError(error);
    if (!Array.isArray(data)) return [];

    return data.filter(isRecord).flatMap((row) => {
      const topicKind = String(row.topic_kind);
      if (
        (topicKind !== 'module' && topicKind !== 'submodule') ||
        typeof row.id !== 'string' ||
        typeof row.name !== 'string' ||
        typeof row.module_id !== 'string' ||
        typeof row.module_name !== 'string'
      ) {
        return [];
      }
      return [
        {
          count: numberValue(row.count_value),
          id: row.id,
          moduleId: row.module_id,
          moduleName: row.module_name,
          name: row.name,
          topicKind,
        },
      ];
    });
  }

  async listCases(
    input: Parameters<ConsultationCasesGateway['listCases']>[0],
  ): Promise<ConsultationCaseSummary[]> {
    const { data, error } = await this.rpc().rpc('list_consultation_cases', {
      p_actor_id: input.reviewerId,
      p_issue_type: input.issueType ?? null,
      p_kind: input.kind ?? null,
      p_limit: input.limit,
      p_module_id: input.moduleId ?? null,
      p_offset: input.offset,
      p_period: input.period,
      p_query: input.query ?? null,
      p_status: input.status ?? null,
      p_submodule_id: input.submoduleId ?? null,
    });
    if (error) databaseError(error);
    return Array.isArray(data) ? data.filter(isRecord).map(asCaseSummary) : [];
  }

  async getCaseDetail(
    input: Parameters<ConsultationCasesGateway['getCaseDetail']>[0],
  ): Promise<ConsultationCaseDetail> {
    const { data, error } = await this.rpc().rpc(
      'get_consultation_case_detail',
      {
        p_actor_id: input.reviewerId,
        p_consultation_case_id: input.caseId,
      },
    );
    if (error) databaseError(error);
    return parseCaseDetail(data);
  }

  async updateCase(
    input: Parameters<ConsultationCasesGateway['updateCase']>[0],
  ): Promise<void> {
    const { error } = await this.rpc().rpc('update_consultation_case', {
      p_actor_id: input.reviewerId,
      p_change_routing: input.changeRouting,
      p_consultation_case_id: input.caseId,
      p_detected_module_id: input.detectedModuleId,
      p_detected_submodule_id: input.detectedSubmoduleId,
      p_note: input.note,
      p_status: input.status,
    });
    if (error) databaseError(error);
  }

  async linkDocument(
    input: Parameters<ConsultationCasesGateway['linkDocument']>[0],
  ): Promise<void> {
    const { error } = await this.rpc().rpc('link_consultation_case_document', {
      p_actor_id: input.reviewerId,
      p_consultation_case_id: input.caseId,
      p_document_id: input.documentId,
    });
    if (error) databaseError(error);
  }

  async unlinkDocument(
    input: Parameters<ConsultationCasesGateway['unlinkDocument']>[0],
  ): Promise<void> {
    const { error } = await this.rpc().rpc(
      'unlink_consultation_case_document',
      {
        p_actor_id: input.reviewerId,
        p_consultation_case_id: input.caseId,
        p_document_id: input.documentId,
      },
    );
    if (error) databaseError(error);
  }

  async decideAttachment(
    input: Parameters<ConsultationCasesGateway['decideAttachment']>[0],
  ): Promise<void> {
    const { error } = await this.rpc().rpc(
      'decide_consultation_case_attachment',
      {
        p_actor_id: input.reviewerId,
        p_attachment_id: input.attachmentId,
        p_consultation_case_id: input.caseId,
        p_disposition: input.disposition,
        p_document_id: input.documentId,
        p_note: input.note,
      },
    );
    if (error) databaseError(error);
  }

  async createAttachmentDownloadUrl(
    input: Parameters<
      ConsultationCasesGateway['createAttachmentDownloadUrl']
    >[0],
  ): Promise<{ expiresAt: string; url: string }> {
    const { data, error } = await this.rpc().rpc(
      'authorize_consultation_case_attachment_download',
      {
        p_actor_id: input.reviewerId,
        p_attachment_id: input.attachmentId,
        p_consultation_case_id: input.caseId,
      },
    );
    if (error) databaseError(error);
    const source = requireOne<{ storage_bucket: string; storage_path: string }>(
      data,
      'The consultation attachment was not found.',
    );
    const signed = await this.requireClient()
      .storage.from(source.storage_bucket)
      .createSignedUrl(source.storage_path, input.ttlSeconds, {
        download: input.download,
      });
    if (signed.error || !signed.data?.signedUrl) {
      throw new ServiceUnavailableException(
        'The consultation attachment is temporarily unavailable.',
      );
    }
    return {
      expiresAt: new Date(Date.now() + input.ttlSeconds * 1000).toISOString(),
      url: signed.data.signedUrl,
    };
  }

  private rpc(): ConsultationCasesRpcClient {
    return this.requireClient() as unknown as ConsultationCasesRpcClient;
  }

  private requireClient(): SupabaseServerClient {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Consultation-case data is not configured.',
      );
    }
    return this.client;
  }
}
