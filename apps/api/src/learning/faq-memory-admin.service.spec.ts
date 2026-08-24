/* eslint-disable @typescript-eslint/unbound-method */
import { BadRequestException } from '@nestjs/common';
import type { AuthorizationContext } from '../authorization';
import type { FaqMemoryGateway } from './faq-memory.gateway';
import { FaqMemoryAdminService } from './faq-memory-admin.service';

const authorization: AuthorizationContext = {
  email: 'admin@example.com',
  emailConfirmedAt: '2026-08-23T00:00:00.000Z',
  role: 'admin',
  userId: '4c8b56af-6d0c-4fef-881e-7c00907540dd',
};

describe('FaqMemoryAdminService', () => {
  let gateway: jest.Mocked<FaqMemoryGateway>;
  let service: FaqMemoryAdminService;

  beforeEach(() => {
    gateway = {
      getQualitySummary: jest.fn(),
      listCandidates: jest.fn(),
      reviewCandidate: jest.fn(),
    };
    service = new FaqMemoryAdminService(gateway);
  });

  it('uses a bounded pending-review queue by default', async () => {
    gateway.listCandidates.mockResolvedValue([]);

    await expect(service.listCandidates({}, authorization)).resolves.toEqual(
      [],
    );

    expect(gateway.listCandidates).toHaveBeenCalledWith({
      limit: 50,
      reviewerId: authorization.userId,
      status: 'pending_review',
    });
  });

  it('delegates quality metrics and review decisions using the authenticated actor', async () => {
    gateway.getQualitySummary.mockResolvedValue({
      ambiguousObservations: 1,
      approvedCandidates: 1,
      evidenceObservations: 2,
      noEvidenceObservations: 1,
      pendingReviewCandidates: 3,
      rejectedCandidates: 0,
      suppressedCandidates: 0,
      totalCandidates: 4,
      totalObservations: 4,
    });
    gateway.reviewCandidate.mockResolvedValue(undefined);

    await expect(service.getQualitySummary(authorization)).resolves.toEqual(
      expect.objectContaining({ totalCandidates: 4 }),
    );
    await expect(
      service.reviewCandidate(
        '5c8b56af-6d0c-4fef-881e-7c00907540dd',
        {
          decision: 'suppressed',
          reviewNote: '  Contiene un patrón que no debe priorizarse.  ',
          reviewLabel: '  Patrón descartado  ',
        },
        authorization,
      ),
    ).resolves.toBeUndefined();

    expect(gateway.getQualitySummary).toHaveBeenCalledWith({
      reviewerId: authorization.userId,
    });
    expect(gateway.reviewCandidate).toHaveBeenCalledWith({
      candidateId: '5c8b56af-6d0c-4fef-881e-7c00907540dd',
      decision: 'suppressed',
      reviewNote: 'Contiene un patrón que no debe priorizarse.',
      reviewLabel: 'Patrón descartado',
      reviewerId: authorization.userId,
    });
  });

  it('requires an explicit operational label before approving a candidate', () => {
    expect(() =>
      service.reviewCandidate(
        '5c8b56af-6d0c-4fef-881e-7c00907540dd',
        { decision: 'approved' },
        authorization,
      ),
    ).toThrow(BadRequestException);
    expect(gateway.reviewCandidate).not.toHaveBeenCalled();

    expect(() =>
      service.reviewCandidate(
        '5c8b56af-6d0c-4fef-881e-7c00907540dd',
        { decision: 'approved', reviewLabel: '   ' },
        authorization,
      ),
    ).toThrow(BadRequestException);

    expect(() =>
      service.reviewCandidate(
        '5c8b56af-6d0c-4fef-881e-7c00907540dd',
        { decision: 'approved', reviewLabel: 'x'.repeat(201) },
        authorization,
      ),
    ).toThrow(BadRequestException);
  });
});
