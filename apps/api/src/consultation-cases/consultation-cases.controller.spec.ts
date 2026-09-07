import {
  AdminConsultationCasesController,
  TeacherConsultationCasesController,
} from './consultation-cases.controller';
import type { ConsultationCasesService } from './consultation-cases.service';

const authorization = {
  email: 'admin@example.test',
  emailConfirmedAt: '2026-09-05T00:00:00.000Z',
  role: 'admin' as const,
  userId: '4c8b56af-6d0c-4fef-881e-7c00907540dd',
};
const caseId = '5c8b56af-6d0c-4fef-881e-7c00907540dd';
const attachmentId = '6c8b56af-6d0c-4fef-881e-7c00907540dd';
const documentId = '7c8b56af-6d0c-4fef-881e-7c00907540dd';

describe('Consultation cases controllers', () => {
  const service = {
    createAttachmentDownloadUrl: jest.fn(),
    createTeacherReport: jest.fn(),
    createTeacherSuggestion: jest.fn(),
    decideAttachment: jest.fn(),
    getCaseDetail: jest.fn(),
    getDashboard: jest.fn(),
    getReviewPriorities: jest.fn(),
    getTopics: jest.fn(),
    linkDocument: jest.fn(),
    listCases: jest.fn(),
    updateCase: jest.fn(),
  };
  const teachers = new TeacherConsultationCasesController(
    service as unknown as ConsultationCasesService,
  );
  const admin = new AdminConsultationCasesController(
    service as unknown as ConsultationCasesService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('keeps teacher submissions scoped to the authenticated teacher', async () => {
    const file = { originalname: 'captura.png' } as Express.Multer.File;
    service.createTeacherReport.mockResolvedValue({ caseId });
    service.createTeacherSuggestion.mockResolvedValue({ caseId });

    await expect(
      teachers.createReport(
        {
          answerMessageId: documentId,
          comment: 'No queda claro el requisito.',
          reason: 'answer_unclear',
          submissionId: attachmentId,
        },
        file,
        authorization,
      ),
    ).resolves.toEqual({ caseId });
    await expect(
      teachers.createSuggestion(
        {
          comment: 'Comparto una norma para revisión.',
          conversationId: caseId,
          submissionId: attachmentId,
        },
        undefined,
        authorization,
      ),
    ).resolves.toEqual({ caseId });

    expect(service.createTeacherReport).toHaveBeenCalledWith(
      expect.objectContaining({ file, userId: authorization.userId }),
    );
    expect(service.createTeacherSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ userId: authorization.userId }),
    );
  });

  it('delegates dashboard, filters and governed case decisions with the reviewer', async () => {
    service.getDashboard.mockResolvedValue({ period: 'month' });
    service.getReviewPriorities.mockResolvedValue([]);
    service.getTopics.mockResolvedValue([]);
    service.listCases.mockResolvedValue([]);
    service.getCaseDetail.mockResolvedValue({ case: { id: caseId } });
    service.createAttachmentDownloadUrl.mockResolvedValue({
      expiresAt: '2026-09-05T00:01:00.000Z',
      url: 'https://example.test/attachment',
    });

    await admin.getDashboard({ period: 'week' }, authorization);
    await admin.getReviewPriorities({ period: 'week' }, authorization);
    await admin.getTopics({ period: 'week' }, authorization);
    await admin.listCases(
      {
        issueType: 'support_partial',
        kind: 'automatic_alert',
        limit: 10,
        moduleId: documentId,
        offset: 5,
        period: 'today',
        query: ' licencia ',
        status: 'pending',
        submoduleId: attachmentId,
      },
      authorization,
    );
    await admin.getCaseDetail(caseId, authorization);
    await admin.updateCase(
      caseId,
      { note: 'Revisar fuente oficial.', status: 'in_review' },
      authorization,
    );
    await admin.linkDocument(caseId, { documentId }, authorization);
    await admin.decideAttachment(
      caseId,
      attachmentId,
      { disposition: 'incorporated', documentId, note: 'Validado.' },
      authorization,
    );
    await admin.createAttachmentDownloadUrl(
      caseId,
      attachmentId,
      { mode: 'view' },
      authorization,
    );

    expect(service.getDashboard).toHaveBeenCalledWith(
      authorization.userId,
      'week',
    );
    expect(service.getReviewPriorities).toHaveBeenCalledWith(
      authorization.userId,
      'week',
    );
    expect(service.getTopics).toHaveBeenCalledWith(
      authorization.userId,
      'week',
    );
    expect(service.listCases).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 10,
        query: 'licencia',
        reviewerId: authorization.userId,
      }),
    );
    expect(service.updateCase).toHaveBeenCalledWith(
      expect.objectContaining({ caseId, reviewerId: authorization.userId }),
    );
    expect(service.decideAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentId,
        caseId,
        reviewerId: authorization.userId,
      }),
    );
    expect(service.createAttachmentDownloadUrl).toHaveBeenCalledWith(
      authorization.userId,
      caseId,
      attachmentId,
      'view',
    );
  });

  it('uses safe defaults when an administrative filter is omitted', async () => {
    await admin.getDashboard({}, authorization);
    await admin.getReviewPriorities({}, authorization);
    await admin.getTopics({}, authorization);
    await admin.listCases({ query: '   ' }, authorization);
    await admin.createAttachmentDownloadUrl(
      caseId,
      attachmentId,
      {},
      authorization,
    );

    expect(service.getDashboard).toHaveBeenCalledWith(
      authorization.userId,
      'month',
    );
    expect(service.getReviewPriorities).toHaveBeenCalledWith(
      authorization.userId,
      'month',
    );
    expect(service.getTopics).toHaveBeenCalledWith(
      authorization.userId,
      'month',
    );
    expect(service.listCases).toHaveBeenCalledWith({
      issueType: undefined,
      kind: undefined,
      limit: 50,
      moduleId: undefined,
      offset: 0,
      period: 'month',
      query: undefined,
      reviewerId: authorization.userId,
      status: undefined,
      submoduleId: undefined,
    });
    expect(service.createAttachmentDownloadUrl).toHaveBeenCalledWith(
      authorization.userId,
      caseId,
      attachmentId,
      'download',
    );
  });
});
