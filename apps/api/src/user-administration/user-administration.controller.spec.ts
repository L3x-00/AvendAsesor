import { UserAdministrationController } from './user-administration.controller';
import type { UserAdministrationService } from './user-administration.service';

describe('UserAdministrationController', () => {
  const service = {
    countUsers: jest.fn(),
    listAuditEvents: jest.fn(),
    listUsers: jest.fn(),
    updateAccessWindow: jest.fn(),
    updateUser: jest.fn(),
  };
  const controller = new UserAdministrationController(
    service as unknown as UserAdministrationService,
  );
  const authorization = {
    email: 'owner@example.test',
    emailConfirmedAt: '2026-08-23T00:00:00.000Z',
    role: 'superadmin' as const,
    userId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
  };

  beforeEach(() => jest.clearAllMocks());

  it('forwards authenticated superadministrator context to each protected action', async () => {
    service.listUsers.mockResolvedValue({
      items: [],
      limit: 10,
      offset: 0,
      total: 0,
    });
    service.listAuditEvents.mockResolvedValue([]);
    service.updateUser.mockResolvedValue({ id: 'target-id' });

    await expect(
      controller.listUsers({ limit: 10 }, authorization),
    ).resolves.toEqual([]);
    await expect(
      controller.listUsersPage({ limit: 10 }, authorization),
    ).resolves.toEqual({ items: [], limit: 10, offset: 0, total: 0 });
    await expect(
      controller.listAuditEvents({ limit: 20 }, authorization),
    ).resolves.toEqual([]);
    await expect(
      controller.updateUser(
        '7c8b56af-6d0c-4fef-881e-7c00907540dd',
        { reason: 'Cambio autorizado.', role: 'admin' },
        authorization,
      ),
    ).resolves.toEqual({ id: 'target-id' });

    expect(service.listUsers).toHaveBeenCalledWith(
      { limit: 10 },
      authorization,
    );
    expect(service.listAuditEvents).toHaveBeenCalledWith(
      { limit: 20 },
      authorization,
    );
    expect(service.updateUser).toHaveBeenCalledWith(
      '7c8b56af-6d0c-4fef-881e-7c00907540dd',
      { reason: 'Cambio autorizado.', role: 'admin' },
      authorization,
    );
  });

  it('forwards directory counts and access-window changes', async () => {
    service.countUsers.mockResolvedValue({
      active: 1,
      expired: 0,
      expiringSoon: 0,
      suspended: 0,
      total: 1,
    });
    service.updateAccessWindow.mockResolvedValue({ id: 'target-id' });

    await expect(
      controller.countUsers({ group: 'docente' }, authorization),
    ).resolves.toEqual({
      active: 1,
      expired: 0,
      expiringSoon: 0,
      suspended: 0,
      total: 1,
    });
    await expect(
      controller.updateAccessWindow(
        '7c8b56af-6d0c-4fef-881e-7c00907540dd',
        { accessExpiresAt: '2027-01-01T00:00:00.000Z', reason: 'Extensión.' },
        authorization,
      ),
    ).resolves.toEqual({ id: 'target-id' });

    expect(service.countUsers).toHaveBeenCalledWith(
      { group: 'docente' },
      authorization,
    );
    expect(service.updateAccessWindow).toHaveBeenCalledWith(
      '7c8b56af-6d0c-4fef-881e-7c00907540dd',
      { accessExpiresAt: '2027-01-01T00:00:00.000Z', reason: 'Extensión.' },
      authorization,
    );
  });
});
