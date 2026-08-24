import { BadRequestException } from '@nestjs/common';
import { OperationsService } from './operations.service';

describe('OperationsService', () => {
  const authorization = {
    email: 'admin@example.test',
    emailConfirmedAt: '2026-08-23T00:00:00.000Z',
    role: 'admin' as const,
    userId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
  };
  const gateway = {
    getMetrics: jest.fn(),
    listUnansweredQuestions: jest.fn(),
    reviewUnansweredQuestion: jest.fn(),
  };
  const service = new OperationsService(gateway);

  beforeEach(() => jest.clearAllMocks());

  it('uses a bounded pending queue by default', async () => {
    gateway.listUnansweredQuestions.mockResolvedValue([]);

    await expect(
      service.listUnansweredQuestions({}, authorization),
    ).resolves.toEqual([]);
    expect(gateway.listUnansweredQuestions).toHaveBeenCalledWith({
      limit: 50,
      reviewerId: authorization.userId,
      status: 'pending_review',
    });
  });

  it('returns only the aggregate metrics supplied by the server gateway', async () => {
    const metrics = { providerCostStatus: 'not_configured' };
    gateway.getMetrics.mockResolvedValue(metrics);

    await expect(service.getMetrics(authorization)).resolves.toEqual(metrics);
    expect(gateway.getMetrics).toHaveBeenCalledWith({
      reviewerId: authorization.userId,
    });
  });

  it('normalizes a review note before it enters the server gateway', async () => {
    gateway.reviewUnansweredQuestion.mockResolvedValue(undefined);

    await service.reviewUnansweredQuestion(
      '8c8b56af-6d0c-4fef-881e-7c00907540dd',
      {
        category: 'documentation_gap',
        decision: 'resolved',
        reviewNote: '  Cargar la norma vigente.  ',
      },
      authorization,
    );

    expect(gateway.reviewUnansweredQuestion).toHaveBeenCalledWith({
      category: 'documentation_gap',
      decision: 'resolved',
      questionId: '8c8b56af-6d0c-4fef-881e-7c00907540dd',
      reviewNote: 'Cargar la norma vigente.',
      reviewerId: authorization.userId,
    });
  });

  it('rejects a whitespace-only review note independently from HTTP DTO validation', () => {
    expect(() =>
      service.reviewUnansweredQuestion(
        '8c8b56af-6d0c-4fef-881e-7c00907540dd',
        {
          category: 'other',
          decision: 'dismissed',
          reviewNote: '   ',
        },
        authorization,
      ),
    ).toThrow(BadRequestException);
  });
});
