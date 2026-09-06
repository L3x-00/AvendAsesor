import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseConsultationCasesGatewayAdapter } from './supabase-consultation-cases.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

const actorId = '4c8b56af-6d0c-4fef-881e-7c00907540dd';
const caseId = '5c8b56af-6d0c-4fef-881e-7c00907540dd';
const attachmentId = '6c8b56af-6d0c-4fef-881e-7c00907540dd';
const documentId = '7c8b56af-6d0c-4fef-881e-7c00907540dd';
const versionId = '8c8b56af-6d0c-4fef-881e-7c00907540dd';
const moduleId = '9c8b56af-6d0c-4fef-881e-7c00907540dd';
const sourceId = 'ac8b56af-6d0c-4fef-881e-7c00907540dd';
const date = '2026-09-05T12:00:00.000Z';

function clientWith(
  rpc: jest.Mock,
  options: { signedUrl?: string; storageError?: unknown } = {},
) {
  const upload = jest
    .fn()
    .mockResolvedValue({ error: options.storageError ?? null });
  const remove = jest
    .fn()
    .mockResolvedValue({ error: options.storageError ?? null });
  const createSignedUrl = jest.fn().mockResolvedValue({
    data: options.signedUrl ? { signedUrl: options.signedUrl } : null,
    error: options.storageError ?? null,
  });
  const from = jest.fn().mockReturnValue({ createSignedUrl, remove, upload });
  return {
    client: { rpc, storage: { from } } as unknown as SupabaseServerClient,
    createSignedUrl,
    from,
    remove,
    upload,
  };
}

function detailPayload() {
  return {
    attachments: [
      {
        attachmentKind: 'suggestion_file',
        createdAt: date,
        disposition: 'pending_review',
        fileSizeBytes: 120,
        id: attachmentId,
        incorporatedDocumentId: null,
        mimeType: 'application/pdf',
        originalFileName: 'norma.pdf',
        sha256: 'a'.repeat(64),
      },
    ],
    case: {
      answerSnapshot: 'Respuesta sustentada [1].',
      conversationId: null,
      consultationTurnId: null,
      createdAt: date,
      detectedModuleId: moduleId,
      detectedModuleName: 'Situaciones administrativas',
      detectedSubmoduleId: null,
      detectedSubmoduleName: null,
      id: caseId,
      issueType: 'teacher_suggestion',
      kind: 'teacher_suggestion',
      questionSnapshot: null,
      reportReason: null,
      reporterComment: 'Norma sugerida',
      requestedModuleId: moduleId,
      requestedModuleName: 'Situaciones administrativas',
      retrievalScope: 'current',
      reviewExcerpt: null,
      snapshotComplete: true,
      status: 'pending',
      topRelevanceScore: null,
      updatedAt: date,
    },
    events: [
      {
        actorId,
        actorName: 'Administrador',
        createdAt: date,
        eventType: 'case_created',
        id: sourceId,
        metadata: { origin: 'teacher_suggestion' },
        note: null,
      },
    ],
    linkedDocuments: [
      {
        id: documentId,
        linkedAt: date,
        linkedBy: actorId,
        publicationStatus: 'active',
        situation: 'current',
        title: 'Norma vigente',
      },
    ],
    sources: [
      {
        articleReference: null,
        documentId,
        documentSituation: 'current',
        documentTitle: 'Norma vigente',
        documentVersionId: versionId,
        evidenceExcerpt: 'Texto exacto.',
        id: sourceId,
        numeralReference: null,
        pageEnd: 1,
        pageStart: 1,
        relevanceScore: 0.9,
        rootModuleId: moduleId,
        sectionTitle: null,
        sourceRank: 1,
        submoduleId: null,
        versionNumber: 1,
      },
    ],
  };
}

describe('SupabaseConsultationCasesGatewayAdapter', () => {
  it('fails closed without a server-only client', async () => {
    await expect(
      new SupabaseConsultationCasesGatewayAdapter(null).getDashboard({
        period: 'month',
        reviewerId: actorId,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('uses controlled RPCs for creation and administrative updates', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ consultation_case_id: caseId }],
      error: null,
    });
    const { client } = clientWith(rpc);
    const gateway = new SupabaseConsultationCasesGatewayAdapter(client);

    await expect(
      gateway.createTeacherCase({
        answerMessageId: null,
        comment: 'Sugerencia',
        conversationId: null,
        kind: 'teacher_suggestion',
        reportReason: null,
        submissionId: attachmentId,
        userId: actorId,
      }),
    ).resolves.toEqual({ caseId });
    await gateway.authorizeTeacherAttachment({
      attachmentKind: 'suggestion_file',
      caseId,
      userId: actorId,
    });
    await gateway.registerTeacherAttachment({
      attachmentKind: 'suggestion_file',
      caseId,
      fileSizeBytes: 12,
      mimeType: 'application/pdf',
      originalFileName: 'norma.pdf',
      sha256: 'a'.repeat(64),
      storagePath: `${caseId}/${'a'.repeat(64)}.pdf`,
      userId: actorId,
    });
    await gateway.updateCase({
      caseId,
      changeRouting: false,
      detectedModuleId: null,
      detectedSubmoduleId: null,
      note: 'Revisado.',
      reviewerId: actorId,
      status: 'in_review',
    });
    await gateway.linkDocument({ caseId, documentId, reviewerId: actorId });
    await gateway.decideAttachment({
      attachmentId,
      caseId,
      disposition: 'not_incorporated',
      documentId: null,
      note: null,
      reviewerId: actorId,
    });

    expect(rpc).toHaveBeenCalledWith(
      'create_teacher_consultation_case',
      expect.objectContaining({ p_user_id: actorId }),
    );
    expect(rpc).toHaveBeenCalledWith(
      'update_consultation_case',
      expect.objectContaining({ p_consultation_case_id: caseId }),
    );
    expect(rpc).toHaveBeenCalledWith(
      'decide_consultation_case_attachment',
      expect.objectContaining({ p_attachment_id: attachmentId }),
    );
  });

  it('maps dashboard, list and detailed case payloads without exposing raw storage paths', async () => {
    const rpc = jest
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            answers_with_incidents: 2,
            consultation_modules: [{ count: 3, id: moduleId, name: 'Módulo' }],
            consultation_submodules: [],
            documents_suggested: 1,
            incident_modules: [],
            incident_submodules: [],
            no_support: 1,
            period: 'month',
            period_end: date,
            period_start: date,
            teacher_reports: 1,
            teacher_suggestions: 1,
            top_consulted_module: { count: 3, id: moduleId, name: 'Módulo' },
            top_consulted_submodule: null,
            top_incident_module: null,
            top_incident_submodule: null,
            total_questions: 3,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            answer_snapshot: null,
            attachment_count: 1,
            conversation_id: null,
            created_at: date,
            detected_module_id: moduleId,
            detected_module_name: 'Módulo',
            detected_submodule_id: null,
            detected_submodule_name: null,
            id: caseId,
            issue_type: 'teacher_suggestion',
            kind: 'teacher_suggestion',
            linked_document_count: 0,
            question_snapshot: null,
            report_reason: null,
            reporter_comment: 'Sugerencia',
            requested_module_id: null,
            requested_module_name: null,
            review_excerpt: null,
            source_count: 0,
            status: 'pending',
            top_relevance_score: null,
            total_count: 1,
            updated_at: date,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: detailPayload(), error: null });
    const { client } = clientWith(rpc);
    const gateway = new SupabaseConsultationCasesGatewayAdapter(client);

    await expect(
      gateway.getDashboard({ period: 'month', reviewerId: actorId }),
    ).resolves.toMatchObject({ documentsSuggested: 1, totalQuestions: 3 });
    await expect(
      gateway.listCases({
        limit: 50,
        offset: 0,
        period: 'month',
        reviewerId: actorId,
      }),
    ).resolves.toMatchObject([{ attachmentCount: 1, id: caseId }]);
    await expect(
      gateway.getCaseDetail({ caseId, reviewerId: actorId }),
    ).resolves.toMatchObject({
      attachments: [{ id: attachmentId, originalFileName: 'norma.pdf' }],
      case: { id: caseId },
      sources: [{ documentId }],
    });
  });

  it('maps detected topics and grouped open-answer priorities', async () => {
    const rpc = jest
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            count_value: 4,
            id: moduleId,
            module_id: moduleId,
            module_name: 'Situaciones administrativas',
            name: 'Licencias',
            topic_kind: 'submodule',
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            answer_message_id: sourceId,
            answer_snapshot: 'Respuesta que requiere revisión.',
            case_id: caseId,
            created_at: date,
            detected_module_name: 'Situaciones administrativas',
            detected_submodule_name: 'Licencias',
            issue_types: ['support_insufficient', 'teacher_report'],
            open_case_count: 2,
            priority: 'critical',
            question_snapshot: '¿Cómo solicito una licencia?',
            review_excerpt: 'Respuesta que requiere revisión.',
          },
        ],
        error: null,
      });
    const { client } = clientWith(rpc);
    const gateway = new SupabaseConsultationCasesGatewayAdapter(client);

    await expect(
      gateway.getTopics({ limit: 5, period: 'week', reviewerId: actorId }),
    ).resolves.toEqual([
      {
        count: 4,
        id: moduleId,
        moduleId,
        moduleName: 'Situaciones administrativas',
        name: 'Licencias',
        topicKind: 'submodule',
      },
    ]);
    await expect(
      gateway.getReviewPriorities({
        limit: 5,
        period: 'week',
        reviewerId: actorId,
      }),
    ).resolves.toMatchObject([
      {
        answerMessageId: sourceId,
        caseId,
        issueTypes: ['support_insufficient', 'teacher_report'],
        openCaseCount: 2,
        priority: 'critical',
      },
    ]);
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      'list_consultation_topics',
      expect.objectContaining({ p_limit: 5, p_period: 'week' }),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'list_consultation_review_priorities',
      expect.objectContaining({ p_limit: 5, p_period: 'week' }),
    );
  });

  it('uploads only to the private consultation bucket and returns short lived download URLs', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [
        {
          storage_bucket: 'consultation-case-attachments',
          storage_path: `${caseId}/file.pdf`,
        },
      ],
      error: null,
    });
    const { client, createSignedUrl, from, remove, upload } = clientWith(rpc, {
      signedUrl: 'https://storage.example.test/private-file',
    });
    const gateway = new SupabaseConsultationCasesGatewayAdapter(client);

    await gateway.uploadAttachment({
      content: Buffer.from('PDF'),
      mimeType: 'application/pdf',
      storagePath: `${caseId}/file.pdf`,
    });
    await gateway.removeAttachment(`${caseId}/file.pdf`);
    await expect(
      gateway.createAttachmentDownloadUrl({
        attachmentId,
        caseId,
        download: true,
        reviewerId: actorId,
        ttlSeconds: 60,
      }),
    ).resolves.toMatchObject({
      url: 'https://storage.example.test/private-file',
    });

    expect(from).toHaveBeenCalledWith('consultation-case-attachments');
    expect(upload).toHaveBeenCalledWith(
      `${caseId}/file.pdf`,
      expect.any(Buffer),
      expect.objectContaining({ upsert: true }),
    );
    expect(remove).toHaveBeenCalledWith([`${caseId}/file.pdf`]);
    expect(createSignedUrl).toHaveBeenCalledWith(`${caseId}/file.pdf`, 60, {
      download: true,
    });
  });

  it('maps authorization errors without leaking database details', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { code: '42501', details: '', hint: '', message: 'raw detail' },
    });
    const { client } = clientWith(rpc);
    const gateway = new SupabaseConsultationCasesGatewayAdapter(client);

    await expect(
      gateway.getDashboard({ period: 'today', reviewerId: actorId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
