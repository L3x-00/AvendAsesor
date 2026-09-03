import { ADMIN_HOME_EXPIRY_WINDOW_DAYS } from './admin-dashboard.gateway';
import { AdministrationService } from './administration.service';

describe('AdministrationService', () => {
  const authorization = {
    email: 'admin@example.test',
    emailConfirmedAt: '2026-09-02T00:00:00.000Z',
    role: 'admin' as const,
    userId: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
  };
  const gateway = {
    getDashboard: jest.fn(),
  };
  const service = new AdministrationService(gateway);

  beforeEach(() => jest.clearAllMocks());

  it('requests the home dashboard for the authenticated administrator and fixed expiry window', async () => {
    const dashboard = {
      expiryWindowDays: ADMIN_HOME_EXPIRY_WINDOW_DAYS,
      moduleSummaries: [],
    };
    gateway.getDashboard.mockResolvedValue(dashboard);

    await expect(service.getDashboard(authorization)).resolves.toBe(dashboard);
    expect(gateway.getDashboard).toHaveBeenCalledWith({
      administratorId: authorization.userId,
      expiringSoonDays: ADMIN_HOME_EXPIRY_WINDOW_DAYS,
    });
  });
});
