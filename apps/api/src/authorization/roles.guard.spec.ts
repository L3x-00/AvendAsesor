import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function createContext(
  role?: 'admin' | 'superadmin' | 'docente',
): ExecutionContext {
  return {
    getClass: () => class TestController {},
    getHandler: () => () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        authorizationContext: role
          ? {
              email: 'user@example.com',
              emailConfirmedAt: '2026-08-09T00:00:00.000Z',
              role,
              userId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
            }
          : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

function createReflector(
  roles: readonly ('admin' | 'superadmin')[] | undefined,
): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(roles),
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('allows a required matching administrative role', () => {
    const guard = new RolesGuard(createReflector(['admin', 'superadmin']));

    expect(guard.canActivate(createContext('admin'))).toBe(true);
    expect(guard.canActivate(createContext('superadmin'))).toBe(true);
  });

  it.each([
    ['docente', ['admin', 'superadmin']],
    [undefined, ['admin', 'superadmin']],
    ['admin', undefined],
    ['admin', []],
  ] as const)(
    'fails closed for role %s and required roles %j',
    (role, roles) => {
      const guard = new RolesGuard(createReflector(roles));

      expect(() => guard.canActivate(createContext(role))).toThrow(
        ForbiddenException,
      );
    },
  );
});
