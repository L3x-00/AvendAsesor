import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ChatHistoryGateway } from '../chat/chat-history.gateway';
import {
  SUPABASE_CHAT_GATEWAY,
  SUPABASE_CONSULTATION_CASES_GATEWAY,
} from '../supabase/supabase.constants';
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
import {
  createUnansweredGroupsAccumulator,
  type UnansweredGroup,
} from './unanswered-groups';

/** Máximo de filas por página que admite `list_consultation_cases`. */
const OPEN_CASES_PAGE_SIZE = 100;
const OPEN_CASE_STATUSES = ['pending', 'in_review'] as const;

@Injectable()
export class ConsultationCasesService {
  constructor(
    @Inject(SUPABASE_CONSULTATION_CASES_GATEWAY)
    private readonly gateway: ConsultationCasesGateway,
    private readonly attachments: AttachmentInspectionService,
    @Optional()
    @Inject(SUPABASE_CHAT_GATEWAY)
    private readonly modulesGateway?: Pick<
      ChatHistoryGateway,
      'listActiveModules'
    >,
  ) {}

  /**
   * Consultas sin sustento abiertas (pendientes o en revisión), agrupadas por
   * tema. Usa el mismo listado con permisos de la bandeja de casos.
   */
  async getUnansweredGroups(
    reviewerId: string,
    period: ConsultationPeriod,
  ): Promise<UnansweredGroup[]> {
    const modules = (await this.modulesGateway?.listActiveModules()) ?? [];
    const groups = createUnansweredGroupsAccumulator(modules);
    const seen = new Set<string>();

    await this.forEachOpenUnansweredCase(reviewerId, period, (item) => {
      // La RPC usa un orden estable; aun así, no se duplica un contador si un
      // caso cambia de estado mientras se recorren las dos listas.
      if (seen.has(item.id)) return;
      seen.add(item.id);
      groups.add(item);
    });

    return groups.values();
  }

  /**
   * Recorre todas las páginas abiertas sin retener el listado completo. El
   * `totalCount` de la RPC determina si queda una página; una página vacía es
   * una salida segura frente a cambios concurrentes o respuestas incompletas.
   */
  private async forEachOpenUnansweredCase(
    reviewerId: string,
    period: ConsultationPeriod,
    visit: (item: ConsultationCaseSummary) => void | boolean,
  ): Promise<void> {
    for (const status of OPEN_CASE_STATUSES) {
      const completed = await this.forEachOpenUnansweredCasePage(
        reviewerId,
        period,
        status,
        visit,
      );
      if (completed) return;
    }
  }

  private async forEachOpenUnansweredCasePage(
    reviewerId: string,
    period: ConsultationPeriod,
    status: (typeof OPEN_CASE_STATUSES)[number],
    visit: (item: ConsultationCaseSummary) => void | boolean,
  ): Promise<boolean> {
    let offset = 0;
    let totalCount: number | null = null;
    const seenIds = new Set<string>();

    while (totalCount === null || offset < totalCount) {
      const page = await this.gateway.listCases({
        issueType: 'support_insufficient',
        kind: 'automatic_alert',
        limit: OPEN_CASES_PAGE_SIZE,
        offset,
        period,
        reviewerId,
        status,
      });
      if (page.length === 0) {
        if (totalCount !== null && offset < totalCount) {
          throw new ServiceUnavailableException(
            'No se pudo completar el listado de consultas abiertas.',
          );
        }
        return false;
      }

      const pageTotalCount = page[0].totalCount;
      if (
        !Number.isSafeInteger(pageTotalCount) ||
        pageTotalCount < offset + page.length ||
        (totalCount !== null && pageTotalCount !== totalCount) ||
        page.some((item) => item.totalCount !== pageTotalCount)
      ) {
        throw new ServiceUnavailableException(
          'No se pudo validar el listado completo de consultas abiertas.',
        );
      }
      totalCount = pageTotalCount;
      for (const item of page) {
        if (seenIds.has(item.id)) {
          throw new ServiceUnavailableException(
            'No se pudo validar el listado completo de consultas abiertas.',
          );
        }
        seenIds.add(item.id);
        if (visit(item) === false) return true;
      }

      offset += OPEN_CASES_PAGE_SIZE;
      if (
        (page.length < OPEN_CASES_PAGE_SIZE && offset !== pageTotalCount) ||
        offset >= pageTotalCount
      ) {
        if (offset < pageTotalCount) {
          throw new ServiceUnavailableException(
            'No se pudo completar el listado de consultas abiertas.',
          );
        }
        return false;
      }
    }
    return false;
  }

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
    expectedStatus?: ConsultationCaseStatus;
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
    // Cambiar el estado exige decir cuál se observó: así una decisión tomada
    // por otra persona entre la lectura y el guardado no se sobrescribe.
    if (input.status && !input.expectedStatus) {
      throw new BadRequestException(
        'A case status change needs the previously observed status.',
      );
    }
    return this.gateway.updateCase({
      caseId: input.caseId,
      changeRouting,
      detectedModuleId: changeRouting ? (input.detectedModuleId ?? null) : null,
      detectedSubmoduleId: changeRouting
        ? (input.detectedSubmoduleId ?? null)
        : null,
      expectedStatus: input.expectedStatus ?? null,
      note: input.note?.trim() || null,
      reviewerId: input.reviewerId,
      status: input.status ?? null,
    });
  }

  /**
   * Resuelve (o descarta) de una vez los casos de un grupo. Cada caso pasa por
   * la misma operación con permisos y deja su nota en el historial; si alguno
   * cambió mientras tanto (ya no existe o ya se cerró), se omite y se informa.
   */
  async resolveGroup(input: {
    caseIds: string[];
    note: string;
    period: ConsultationPeriod;
    reviewerId: string;
    status: 'discarded' | 'resolved';
  }): Promise<{ failed: number; skipped: number; updated: number }> {
    // Se revalida en el servidor: solo se cierran consultas sin sustento que
    // sigan abiertas. Una que otra persona cerró o cambió mientras tanto se
    // omite (no se reabre ni se avisa al docente por error).
    const requested = new Set(input.caseIds);
    // Estado observado por caso: se usa como condición del cambio (CAS).
    const open = new Map<string, ConsultationCaseStatus>();
    await this.forEachOpenUnansweredCase(
      input.reviewerId,
      input.period,
      (item) => {
        if (requested.has(item.id)) open.set(item.id, item.status);
        // No se recorren páginas o estados adicionales cuando ya se validaron
        // todos los identificadores accionables que envió el formulario.
        return open.size < requested.size;
      },
    );
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    for (const caseId of new Set(input.caseIds)) {
      const expectedStatus = open.get(caseId);
      if (!expectedStatus) {
        skipped += 1;
        continue;
      }
      try {
        await this.updateCase({
          caseId,
          expectedStatus,
          note: input.note,
          reviewerId: input.reviewerId,
          status: input.status,
        });
        updated += 1;
      } catch (error) {
        if (
          error instanceof NotFoundException ||
          error instanceof ConflictException
        ) {
          skipped += 1;
        } else {
          // Se sigue con el resto y se informa: los ya cerrados no se repiten
          // al reintentar porque dejan de estar abiertos.
          failed += 1;
        }
      }
    }
    return { failed, skipped, updated };
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
