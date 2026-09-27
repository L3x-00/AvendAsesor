/* eslint-disable @typescript-eslint/unbound-method */
import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AdminConsultationCasesController } from './consultation-cases.controller';
import type {
  ConsultationCaseSummary,
  ConsultationCasesGateway,
} from './consultation-cases.gateway';
import { ConsultationCasesService } from './consultation-cases.service';

const reviewerId = '4c8b56af-6d0c-4fef-881e-7c00907540dd';

function gateway(): jest.Mocked<ConsultationCasesGateway> {
  return {
    authorizeTeacherAttachment: jest.fn(),
    createAttachmentDownloadUrl: jest.fn(),
    createTeacherCase: jest.fn(),
    decideAttachment: jest.fn(),
    getCaseDetail: jest.fn(),
    getDashboard: jest.fn(),
    getReviewPriorities: jest.fn(),
    getTopics: jest.fn(),
    linkDocument: jest.fn(),
    listCases: jest.fn().mockResolvedValue([]),
    registerTeacherAttachment: jest.fn(),
    removeAttachment: jest.fn(),
    unlinkDocument: jest.fn(),
    updateCase: jest.fn().mockResolvedValue(undefined),
    uploadAttachment: jest.fn(),
  };
}

function summary(id: string, question: string): ConsultationCaseSummary {
  return {
    answerSnapshot: null,
    attachmentCount: 0,
    conversationId: null,
    createdAt: '2026-09-26T10:00:00.000Z',
    detectedModuleId: null,
    detectedModuleName: null,
    detectedSubmoduleId: null,
    detectedSubmoduleName: null,
    id,
    issueType: 'support_insufficient',
    kind: 'automatic_alert',
    linkedDocumentCount: 0,
    questionSnapshot: question,
    reportReason: null,
    reporterComment: null,
    requestedModuleId: null,
    requestedModuleName: null,
    reviewExcerpt: null,
    sourceCount: 0,
    status: 'pending',
    topRelevanceScore: null,
    totalCount: 1,
    updatedAt: '2026-09-26T10:00:00.000Z',
  };
}

describe('ConsultationCasesService — consultas sin sustento agrupadas', () => {
  it('agrupa los casos abiertos (pendientes y en revisión) con los módulos activos', async () => {
    const cases = gateway();
    cases.listCases
      .mockResolvedValueOnce([summary('a', 'remuneraciones del docente')])
      .mockResolvedValueOnce([summary('b', 'escala de remuneraciones')]);
    const modules = {
      listActiveModules: jest.fn().mockResolvedValue([
        {
          code: 'REM',
          description: null,
          id: 'rem',
          name: 'Remuneraciones',
          parentModuleId: null,
          sortOrder: 0,
        },
      ]),
    };
    const service = new ConsultationCasesService(
      cases,
      { inspect: jest.fn() },
      modules,
    );

    const groups = await service.getUnansweredGroups(reviewerId, 'week');

    expect(cases.listCases).toHaveBeenCalledWith(
      expect.objectContaining({
        issueType: 'support_insufficient',
        kind: 'automatic_alert',
        period: 'week',
        reviewerId,
        status: 'pending',
      }),
    );
    expect(cases.listCases).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'in_review' }),
    );
    expect(groups).toEqual([
      expect.objectContaining({
        caseIds: ['a', 'b'],
        count: 2,
        moduleName: 'Remuneraciones',
      }),
    ]);
  });

  it('sin módulos disponibles agrupa igual, sin tema', async () => {
    const cases = gateway();
    cases.listCases.mockResolvedValueOnce([summary('a', 'hola')]);
    const service = new ConsultationCasesService(cases, {
      inspect: jest.fn(),
    });

    await expect(
      service.getUnansweredGroups(reviewerId, 'month'),
    ).resolves.toEqual([expect.objectContaining({ kind: 'unknown' })]);
  });

  it('resuelve solo los casos aún abiertos e informa omitidos y fallas', async () => {
    const cases = gateway();
    cases.listCases
      .mockResolvedValueOnce([summary('a', 'x'), summary('b', 'x')])
      .mockResolvedValueOnce([summary('d', 'x'), summary('e', 'x')]);
    cases.updateCase
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new NotFoundException())
      .mockRejectedValueOnce(new ServiceUnavailableException())
      .mockResolvedValueOnce(undefined);
    const service = new ConsultationCasesService(cases, {
      inspect: jest.fn(),
    });

    await expect(
      service.resolveGroup({
        // «c» ya no está abierto (otra persona lo cerró): no se toca.
        caseIds: ['a', 'b', 'c', 'd', 'e', 'a'],
        note: '  Se cargó el documento.  ',
        period: 'week',
        reviewerId,
        status: 'resolved',
      }),
    ).resolves.toEqual({ failed: 1, skipped: 2, updated: 2 });
    expect(cases.listCases).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 100,
        period: 'week',
        status: 'pending',
      }),
    );
    expect(cases.updateCase).toHaveBeenCalledTimes(4);
    expect(cases.updateCase).not.toHaveBeenCalledWith(
      expect.objectContaining({ caseId: 'c' }),
    );
    expect(cases.updateCase).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: 'a',
        note: 'Se cargó el documento.',
        reviewerId,
        status: 'resolved',
      }),
    );
  });

  it('también sirve para descartar un grupo', async () => {
    const cases = gateway();
    cases.listCases.mockResolvedValueOnce([
      summary('a', 'x'),
      summary('b', 'x'),
    ]);
    // «b» cambió justo antes de cerrarse: se omite.
    cases.updateCase
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ConflictException());
    const service = new ConsultationCasesService(cases, {
      inspect: jest.fn(),
    });

    await expect(
      service.resolveGroup({
        caseIds: ['a', 'b'],
        note: 'Prueba',
        period: 'month',
        reviewerId,
        status: 'discarded',
      }),
    ).resolves.toEqual({ failed: 0, skipped: 1, updated: 1 });
    expect(cases.updateCase).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'discarded' }),
    );
  });

  it('el controlador delega con el revisor autenticado y el periodo por defecto', async () => {
    const service = {
      getUnansweredGroups: jest.fn().mockResolvedValue([]),
      resolveGroup: jest
        .fn()
        .mockResolvedValue({ failed: 0, skipped: 0, updated: 1 }),
    };
    const controller = new AdminConsultationCasesController(service as never);
    const authorization = {
      email: 'admin@example.com',
      emailConfirmedAt: null,
      role: 'admin' as const,
      userId: reviewerId,
    };

    await controller.getUnansweredGroups({}, authorization);
    await controller.resolveGroup(
      { caseIds: ['a'], note: 'Listo', status: 'resolved' },
      authorization,
    );

    expect(service.getUnansweredGroups).toHaveBeenCalledWith(
      reviewerId,
      'month',
    );
    expect(service.resolveGroup).toHaveBeenCalledWith({
      caseIds: ['a'],
      note: 'Listo',
      period: 'month',
      reviewerId,
      status: 'resolved',
    });
  });
});
