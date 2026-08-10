import { AdministrationController } from './administration.controller';

describe('AdministrationController', () => {
  const controller = new AdministrationController();

  it('returns the verified administrative role without profile data', () => {
    expect(
      controller.getAccess({
        email: 'admin@example.com',
        emailConfirmedAt: '2026-08-09T00:00:00.000Z',
        role: 'admin',
        userId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
      }),
    ).toEqual({ role: 'admin', status: 'authorized' });
  });

  it('returns the conservative superadmin-only system acknowledgement', () => {
    expect(controller.getSystemAccess()).toEqual({ status: 'authorized' });
  });
});
