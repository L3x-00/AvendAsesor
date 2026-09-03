import { AdministrationController } from './administration.controller';
import type { AdministrationService } from './administration.service';

describe('AdministrationController', () => {
  const service = {
    getDashboard: jest.fn(),
  };
  const controller = new AdministrationController(
    service as unknown as AdministrationService,
  );
  const authorization = {
    email: 'admin@example.com',
    emailConfirmedAt: '2026-08-09T00:00:00.000Z',
    role: 'admin' as const,
    userId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
  };

  beforeEach(() => jest.clearAllMocks());

  it('forwards the authenticated administrator to the dashboard service', async () => {
    const dashboard = { expiryWindowDays: 7, moduleSummaries: [] };
    service.getDashboard.mockResolvedValue(dashboard);

    await expect(controller.getDashboard(authorization)).resolves.toBe(
      dashboard,
    );
    expect(service.getDashboard).toHaveBeenCalledWith(authorization);
  });

  it('returns the verified administrative role without profile data', () => {
    expect(controller.getAccess(authorization)).toEqual({
      role: 'admin',
      status: 'authorized',
    });
  });

  it('returns the conservative superadmin-only system acknowledgement', () => {
    expect(controller.getSystemAccess()).toEqual({ status: 'authorized' });
  });
});
