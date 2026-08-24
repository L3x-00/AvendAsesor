/* eslint-disable @typescript-eslint/unbound-method */
import type { AuthorizationContext } from '../authorization';
import { FaqMemoryAdminController } from './faq-memory-admin.controller';
import { FaqMemoryAdminService } from './faq-memory-admin.service';

const authorization: AuthorizationContext = {
  email: 'admin@example.com',
  emailConfirmedAt: '2026-08-23T00:00:00.000Z',
  role: 'admin',
  userId: '4c8b56af-6d0c-4fef-881e-7c00907540dd',
};

function createService(): jest.Mocked<FaqMemoryAdminService> {
  return {
    getQualitySummary: jest.fn(),
    listCandidates: jest.fn(),
    reviewCandidate: jest.fn(),
  } as unknown as jest.Mocked<FaqMemoryAdminService>;
}

describe('FaqMemoryAdminController', () => {
  it('delegates the protected review queue without constructing data in the controller', async () => {
    const service = createService();
    const controller = new FaqMemoryAdminController(service);
    service.getQualitySummary.mockResolvedValue({
      ambiguousObservations: 0,
      approvedCandidates: 0,
      evidenceObservations: 0,
      noEvidenceObservations: 0,
      pendingReviewCandidates: 0,
      rejectedCandidates: 0,
      suppressedCandidates: 0,
      totalCandidates: 0,
      totalObservations: 0,
    });
    service.listCandidates.mockResolvedValue([]);
    service.reviewCandidate.mockResolvedValue(undefined);

    await expect(controller.getQualitySummary(authorization)).resolves.toEqual(
      expect.objectContaining({ totalCandidates: 0 }),
    );
    await expect(
      controller.listCandidates(
        { status: 'approved', limit: 20 },
        authorization,
      ),
    ).resolves.toEqual([]);
    await expect(
      controller.reviewCandidate(
        '5c8b56af-6d0c-4fef-881e-7c00907540dd',
        {
          decision: 'approved',
          reviewLabel: 'Solicitud de licencia docente',
        },
        authorization,
      ),
    ).resolves.toBeUndefined();

    expect(service.listCandidates).toHaveBeenCalledWith(
      { status: 'approved', limit: 20 },
      authorization,
    );
    expect(service.reviewCandidate).toHaveBeenCalledWith(
      '5c8b56af-6d0c-4fef-881e-7c00907540dd',
      {
        decision: 'approved',
        reviewLabel: 'Solicitud de licencia docente',
      },
      authorization,
    );
  });
});
