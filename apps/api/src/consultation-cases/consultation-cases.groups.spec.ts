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

function summary(
  id: string,
  question: string,
  overrides: Partial<ConsultationCaseSummary> = {},
): ConsultationCaseSummary {
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
    ...overrides,
  };
}

function pagedCases(
  status: 'in_review' | 'pending',
  count: number,
  question: string,
): ConsultationCaseSummary[] {
  return Array.from({ length: count }, (_, index) =>
    summary(`${status}-${index}`, question, {
      createdAt: `2026-09-${String((index % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
      status,
      totalCount: count,
    }),
  );
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

  it.each([50, 100, 101, 250])(
    'agrupa correctamente %i casos aunque excedan una página',
    async (count) => {
      const cases = gateway();
      const pending = pagedCases('pending', count, 'remuneraciones');
      cases.listCases.mockImplementation((input) => {
        const source = input.status === 'pending' ? pending : [];
        return Promise.resolve(
          source.slice(input.offset, input.offset + input.limit),
        );
      });
      const service = new ConsultationCasesService(cases, {
        inspect: jest.fn(),
      });

      const [group] = await service.getUnansweredGroups(reviewerId, 'month');

      expect(group).toEqual(
        expect.objectContaining({
          caseIds: pending.slice(0, 50).map((item) => item.id),
          count,
        }),
      );
      const pendingOffsets = cases.listCases.mock.calls
        .filter(([input]) => input.status === 'pending')
        .map(([input]) => input.offset);
      expect(pendingOffsets).toEqual(
        Array.from(
          { length: Math.ceil(count / 100) },
          (_, index) => index * 100,
        ),
      );
    },
  );

  it('suma pendientes y en revisión de más de cien casos sin mezclar temas', async () => {
    const cases = gateway();
    const pending = pagedCases('pending', 125, 'remuneraciones').map(
      (item) => ({
        ...item,
        detectedModuleId: 'rem',
      }),
    );
    const inReview = pagedCases('in_review', 130, 'vacaciones').map((item) => ({
      ...item,
      detectedModuleId: 'vac',
    }));
    cases.listCases.mockImplementation((input) => {
      const source = input.status === 'pending' ? pending : inReview;
      return Promise.resolve(
        source.slice(input.offset, input.offset + input.limit),
      );
    });
    const service = new ConsultationCasesService(
      cases,
      { inspect: jest.fn() },
      {
        listActiveModules: jest.fn().mockResolvedValue([
          {
            code: 'REM',
            description: null,
            id: 'rem',
            name: 'Remuneraciones',
            parentModuleId: null,
            sortOrder: 0,
          },
          {
            code: 'VAC',
            description: null,
            id: 'vac',
            name: 'Vacaciones',
            parentModuleId: null,
            sortOrder: 1,
          },
        ]),
      },
    );

    const groups = await service.getUnansweredGroups(reviewerId, 'month');

    expect(groups.map((group) => group.count).sort((a, b) => a - b)).toEqual([
      125, 130,
    ]);
    expect(groups.every((group) => group.caseIds.length === 50)).toBe(true);
    expect(groups.map((group) => group.caseIds)).toEqual(
      expect.arrayContaining([
        pending.slice(0, 50).map((item) => item.id),
        inReview.slice(0, 50).map((item) => item.id),
      ]),
    );
  });

  it('no duplica un caso que cambió de pendiente a revisión durante el recorrido', async () => {
    const cases = gateway();
    cases.listCases.mockImplementation((input) => {
      return Promise.resolve([
        summary('a', 'remuneraciones', {
          status: input.status ?? 'pending',
          totalCount: 1,
        }),
      ]);
    });
    const service = new ConsultationCasesService(cases, { inspect: jest.fn() });

    const [group] = await service.getUnansweredGroups(reviewerId, 'month');

    expect(group?.count).toBe(1);
    expect(new Set(group?.caseIds).size).toBe(group?.caseIds.length);
  });

  it('rechaza un identificador duplicado entre páginas del mismo estado', async () => {
    const cases = gateway();
    const first = pagedCases('pending', 200, 'remuneraciones').slice(0, 100);
    const second = [
      first[99],
      ...pagedCases('pending', 200, 'remuneraciones').slice(100, 199),
    ];
    cases.listCases.mockImplementation((input) => {
      if (input.status === 'in_review') return Promise.resolve([]);
      return Promise.resolve(input.offset === 0 ? first : second);
    });
    const service = new ConsultationCasesService(cases, { inspect: jest.fn() });

    await expect(
      service.getUnansweredGroups(reviewerId, 'month'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('propaga el error de una página y no devuelve un contador parcial', async () => {
    const cases = gateway();
    cases.listCases.mockImplementation((input) => {
      if (input.status === 'in_review') return Promise.resolve([]);
      if (input.offset === 0)
        return Promise.resolve(
          pagedCases('pending', 101, 'remuneraciones').slice(0, 100),
        );
      return Promise.reject(new ServiceUnavailableException());
    });
    const service = new ConsultationCasesService(cases, { inspect: jest.fn() });

    await expect(
      service.getUnansweredGroups(reviewerId, 'month'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rechaza una página corta cuando totalCount indica que faltan casos', async () => {
    const cases = gateway();
    cases.listCases.mockImplementation((input) => {
      if (input.status === 'in_review') return Promise.resolve([]);
      return Promise.resolve(
        pagedCases('pending', 101, 'remuneraciones').slice(0, 50),
      );
    });
    const service = new ConsultationCasesService(cases, { inspect: jest.fn() });

    await expect(
      service.getUnansweredGroups(reviewerId, 'month'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rechaza una página vacía antes de completar totalCount', async () => {
    const cases = gateway();
    cases.listCases.mockImplementation((input) => {
      if (input.status === 'in_review') return Promise.resolve([]);
      if (input.offset === 0)
        return Promise.resolve(
          pagedCases('pending', 101, 'remuneraciones').slice(0, 100),
        );
      return Promise.resolve([]);
    });
    const service = new ConsultationCasesService(cases, { inspect: jest.fn() });

    await expect(
      service.getUnansweredGroups(reviewerId, 'month'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rechaza totalCount ausente para no mostrar un total incompleto', async () => {
    const cases = gateway();
    cases.listCases.mockImplementation((input) => {
      if (input.status === 'in_review') return Promise.resolve([]);
      return Promise.resolve([
        summary('a', 'remuneraciones', {
          totalCount: undefined as unknown as number,
        }),
      ]);
    });
    const service = new ConsultationCasesService(cases, { inspect: jest.fn() });

    await expect(
      service.getUnansweredGroups(reviewerId, 'month'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rechaza filas con totalCount inconsistente dentro de la misma página', async () => {
    const cases = gateway();
    cases.listCases.mockImplementation((input) => {
      if (input.status === 'in_review') return Promise.resolve([]);
      return Promise.resolve([
        summary('a', 'remuneraciones', { totalCount: 5 }),
        summary('b', 'remuneraciones', { totalCount: 4 }),
      ]);
    });
    const service = new ConsultationCasesService(cases, { inspect: jest.fn() });

    await expect(
      service.getUnansweredGroups(reviewerId, 'month'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rechaza un totalCount que difiere entre páginas del mismo estado', async () => {
    const cases = gateway();
    const pending = pagedCases('pending', 250, 'remuneraciones');
    cases.listCases.mockImplementation((input) => {
      if (input.status === 'in_review') return Promise.resolve([]);
      const source = pending.slice(input.offset, input.offset + input.limit);
      // La segunda página declara un total distinto (concurrencia durante el
      // recorrido): no se puede afirmar un agregado íntegro.
      return Promise.resolve(
        source.map((item) => ({
          ...item,
          totalCount: input.offset === 0 ? 200 : 250,
        })),
      );
    });
    const service = new ConsultationCasesService(cases, { inspect: jest.fn() });

    await expect(
      service.getUnansweredGroups(reviewerId, 'month'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('resuelve solo los casos aún abiertos e informa omitidos y fallas', async () => {
    const cases = gateway();
    cases.listCases
      .mockResolvedValueOnce([
        summary('a', 'x', { totalCount: 2 }),
        summary('b', 'x', { totalCount: 2 }),
      ])
      .mockResolvedValueOnce([
        summary('d', 'x', { totalCount: 2 }),
        summary('e', 'x', { totalCount: 2 }),
      ]);
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
      summary('a', 'x', { totalCount: 2 }),
      summary('b', 'x', { totalCount: 2 }),
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

  it('revalida casos accionables en páginas posteriores sin cerrar consultas ajenas', async () => {
    const cases = gateway();
    const pending = pagedCases('pending', 101, 'remuneraciones');
    cases.listCases.mockImplementation((input) => {
      const source = input.status === 'pending' ? pending : [];
      return Promise.resolve(
        source.slice(input.offset, input.offset + input.limit),
      );
    });
    const service = new ConsultationCasesService(cases, { inspect: jest.fn() });

    await expect(
      service.resolveGroup({
        caseIds: [pending[100].id, '00000000-0000-4000-8000-000000000099'],
        note: 'Documento incorporado',
        period: 'month',
        reviewerId,
        status: 'resolved',
      }),
    ).resolves.toEqual({ failed: 0, skipped: 1, updated: 1 });
    expect(cases.updateCase).toHaveBeenCalledTimes(1);
    expect(cases.updateCase).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: pending[100].id }),
    );
    expect(cases.listCases).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 100, status: 'pending' }),
    );
  });

  it('deja de recorrer páginas y estados cuando ya validó todos los casos accionables', async () => {
    const cases = gateway();
    const pending = pagedCases('pending', 300, 'remuneraciones');
    cases.listCases.mockImplementation((input) => {
      const source = input.status === 'pending' ? pending : [];
      return Promise.resolve(
        source.slice(input.offset, input.offset + input.limit),
      );
    });
    cases.updateCase.mockResolvedValue(undefined);
    const service = new ConsultationCasesService(cases, { inspect: jest.fn() });

    await expect(
      service.resolveGroup({
        caseIds: [pending[0].id, pending[1].id],
        note: 'Documento incorporado',
        period: 'month',
        reviewerId,
        status: 'resolved',
      }),
    ).resolves.toEqual({ failed: 0, skipped: 0, updated: 2 });
    expect(cases.listCases).toHaveBeenCalledTimes(1);
    expect(cases.listCases).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0, status: 'pending' }),
    );
  });

  it('actualiza el contador cuando se cierran casos sin afectar los demás', async () => {
    const cases = gateway();
    let pending = pagedCases('pending', 3, 'remuneraciones');
    cases.listCases.mockImplementation((input) => {
      const source = input.status === 'pending' ? pending : [];
      return Promise.resolve(
        source.slice(input.offset, input.offset + input.limit),
      );
    });
    cases.updateCase.mockImplementation(({ caseId }) => {
      pending = pending.filter((item) => item.id !== caseId);
      return Promise.resolve();
    });
    const service = new ConsultationCasesService(cases, { inspect: jest.fn() });

    expect(
      (await service.getUnansweredGroups(reviewerId, 'month'))[0]?.count,
    ).toBe(3);
    await service.resolveGroup({
      caseIds: [pending[0].id],
      note: 'Documento incorporado',
      period: 'month',
      reviewerId,
      status: 'resolved',
    });
    expect(
      (await service.getUnansweredGroups(reviewerId, 'month'))[0]?.count,
    ).toBe(2);
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
