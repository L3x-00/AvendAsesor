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
    countUsers: jest.fn(),
    listAuditEvents: jest.fn(),
    listUsers: jest.fn(),
    updateAccessWindow: jest.fn(),
    updateUser: jest.fn(),
  };
  const service = new UserAdministrationService(gateway);

  beforeEach(() => jest.clearAllMocks());

  it('preserves the bounded 50-user legacy default and a null search', async () => {
    gateway.listUsers.mockResolvedValue({
      items: [],
      limit: 50,
      offset: 0,
      total: 0,
    });
    gateway.listAuditEvents.mockResolvedValue([]);

    await expect(service.listUsers({}, authorization)).resolves.toEqual({
      items: [],
      limit: 50,
      offset: 0,
      total: 0,
    });
    await expect(service.listAuditEvents({}, authorization)).resolves.toEqual(
      [],
    );

    expect(gateway.listUsers).toHaveBeenCalledWith({
      accessState: null,
      actorId: authorization.userId,
      group: null,
      limit: 50,
      offset: 0,
      search: null,
      status: null,
    });
    expect(gateway.listAuditEvents).toHaveBeenCalledWith({
      actorId: authorization.userId,
      limit: 50,
    });
  });

  it('forwards global directory filters and pagination to the gateway', async () => {
    gateway.listUsers.mockResolvedValue({
      items: [],
      limit: 20,
      offset: 40,
      total: 0,
    });

    await service.listUsers(
      {
        accessState: 'por_vencer',
        group: 'staff',
        limit: 20,
        offset: 40,
        search: '  Ana  ',
        status: 'suspended',
      },
      authorization,
    );

    expect(gateway.listUsers).toHaveBeenCalledWith({
      accessState: 'por_vencer',
      actorId: authorization.userId,
      group: 'staff',
      limit: 20,
      offset: 40,
      search: 'Ana',
      status: 'suspended',
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

  it('scopes directory counts to the current group and search', async () => {
    gateway.countUsers.mockResolvedValue({
      active: 3,
      expired: 1,
      expiringSoon: 2,
      suspended: 0,
      total: 4,
    });

    await service.countUsers(
      { group: 'docente', search: '  Ana  ' },
      authorization,
    );

    expect(gateway.countUsers).toHaveBeenCalledWith({
      actorId: authorization.userId,
      group: 'docente',
      search: 'Ana',
    });
  });

  it('normalizes access-window dates and forwards the change with a reason', async () => {
    gateway.updateAccessWindow.mockResolvedValue({ id: 'target-id' });

    await service.updateAccessWindow(
      '7c8b56af-6d0c-4fef-881e-7c00907540dd',
      {
        accessExpiresAt: '2027-01-31T00:00:00.000Z',
        accessStartAt: '2027-01-01T00:00:00.000Z',
        reason: '  Extensión de vigencia autorizada.  ',
      },
      authorization,
    );

    expect(gateway.updateAccessWindow).toHaveBeenCalledWith({
      accessExpiresAt: '2027-01-31T00:00:00.000Z',
      accessStartAt: '2027-01-01T00:00:00.000Z',
      actorId: authorization.userId,
      reason: 'Extensión de vigencia autorizada.',
      targetUserId: '7c8b56af-6d0c-4fef-881e-7c00907540dd',
    });
  });

  it('treats blank access-window dates as an indefinite (null) window', async () => {
    gateway.updateAccessWindow.mockResolvedValue({ id: 'target-id' });

    await service.updateAccessWindow(
      '7c8b56af-6d0c-4fef-881e-7c00907540dd',
      { accessExpiresAt: '', accessStartAt: '', reason: 'Sin vigencia fija.' },
      authorization,
    );

    expect(gateway.updateAccessWindow).toHaveBeenCalledWith({
      accessExpiresAt: null,
      accessStartAt: null,
      actorId: authorization.userId,
      reason: 'Sin vigencia fija.',
      targetUserId: '7c8b56af-6d0c-4fef-881e-7c00907540dd',
    });
  });

  it('rejects an access window whose start is after its expiry', () => {
    expect(() =>
      service.updateAccessWindow(
        '7c8b56af-6d0c-4fef-881e-7c00907540dd',
        {
          accessExpiresAt: '2027-01-01T00:00:00.000Z',
          accessStartAt: '2027-02-01T00:00:00.000Z',
          reason: 'Rango inválido.',
        },
        authorization,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects an access-window change without a valid reason', () => {
    expect(() =>
      service.updateAccessWindow(
        '7c8b56af-6d0c-4fef-881e-7c00907540dd',
        { accessExpiresAt: '2027-01-01T00:00:00.000Z', reason: '  ' },
        authorization,
      ),
    ).toThrow(BadRequestException);
  });
});
