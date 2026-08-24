import { OperationsController } from './operations.controller';
import type { OperationsService } from './operations.service';

describe('OperationsController', () => {
  const service = {
    getMetrics: jest.fn(),
    listUnansweredQuestions: jest.fn(),
    reviewUnansweredQuestion: jest.fn(),
  };
  const controller = new OperationsController(
    service as unknown as OperationsService,
  );
  const authorization = {
    email: 'admin@example.test',
    emailConfirmedAt: '2026-08-23T00:00:00.000Z',
    role: 'admin' as const,
    userId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
  };

  beforeEach(() => jest.clearAllMocks());

  it('delegates all protected operational actions with the authenticated actor', async () => {
    service.getMetrics.mockResolvedValue({
      providerCostStatus: 'not_configured',
    });
    service.listUnansweredQuestions.mockResolvedValue([]);
    service.reviewUnansweredQuestion.mockResolvedValue(undefined);

    await expect(controller.getMetrics(authorization)).resolves.toEqual({
      providerCostStatus: 'not_configured',
    });
    await expect(
      controller.listUnansweredQuestions({ limit: 10 }, authorization),
    ).resolves.toEqual([]);
    await expect(
      controller.reviewUnansweredQuestion(
        '8c8b56af-6d0c-4fef-881e-7c00907540dd',
        {
          category: 'documentation_gap',
          decision: 'resolved',
          reviewNote: 'Cargar la norma vigente.',
        },
        authorization,
      ),
    ).resolves.toBeUndefined();

    expect(service.getMetrics).toHaveBeenCalledWith(authorization);
    expect(service.listUnansweredQuestions).toHaveBeenCalledWith(
      { limit: 10 },
      authorization,
    );
  });
});
