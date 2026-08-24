import { BadRequestException } from '@nestjs/common';
import { UserAdministrationService } from './user-administration.service';

const authorization = {
  email: 'owner@example.test',
  emailConfirmedAt: '2026-08-23T00:00:00.000Z',
  role: 'superadmin' as const,
  userId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
};

describe('UserAdministrationService', () => {
  const gateway = {
    listAuditEvents: jest.fn(),
    listUsers: jest.fn(),
    updateUser: jest.fn(),
  };
  const service = new UserAdministrationService(gateway);

  beforeEach(() => jest.clearAllMocks());

  it('uses bounded server-side listings and a null search by default', async () => {
    gateway.listUsers.mockResolvedValue([]);
    gateway.listAuditEvents.mockResolvedValue([]);

    await expect(service.listUsers({}, authorization)).resolves.toEqual([]);
    await expect(service.listAuditEvents({}, authorization)).resolves.toEqual(
      [],
    );

    expect(gateway.listUsers).toHaveBeenCalledWith({
      actorId: authorization.userId,
      limit: 50,
      search: null,
    });
    expect(gateway.listAuditEvents).toHaveBeenCalledWith({
      actorId: authorization.userId,
      limit: 50,
    });
  });

  it('normalizes a justified role or status change before the database call', async () => {
    gateway.updateUser.mockResolvedValue({ id: 'target-id' });

    await service.updateUser(
      '7c8b56af-6d0c-4fef-881e-7c00907540dd',
      {
        accountStatus: 'suspended',
        reason: '  Suspensión aprobada por incidencia verificada.  ',
      },
      authorization,
    );

    expect(gateway.updateUser).toHaveBeenCalledWith({
      accountStatus: 'suspended',
      actorId: authorization.userId,
      reason: 'Suspensión aprobada por incidencia verificada.',
      role: null,
      targetUserId: '7c8b56af-6d0c-4fef-881e-7c00907540dd',
    });
  });

  it('rejects ineffective or whitespace-only changes independently of DTO validation', () => {
    expect(() =>
      service.updateUser(
        '7c8b56af-6d0c-4fef-881e-7c00907540dd',
        { reason: 'Motivo válido.' },
        authorization,
      ),
    ).toThrow(BadRequestException);

    expect(() =>
      service.updateUser(
        '7c8b56af-6d0c-4fef-881e-7c00907540dd',
        { reason: '   ', role: 'admin' },
        authorization,
      ),
    ).toThrow(BadRequestException);
  });
});
