import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { FeaturesGuard } from './features.guard';

function context(modulesAccess?: boolean): ExecutionContext {
  return {
    getClass: () => class TestController {},
    getHandler: () => () => undefined,
    switchToHttp: () => ({
      getRequest: () =>
        modulesAccess === undefined
          ? {}
          : {
              authorizationContext: {
                email: null,
                emailConfirmedAt: null,
                modulesAccess,
                role: 'admin',
                userId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
              },
            },
    }),
  } as unknown as ExecutionContext;
}

function reflector(features: string[] | undefined): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(features),
  } as unknown as Reflector;
}

describe('FeaturesGuard', () => {
  it('allows a request with the required Modules permission', () => {
    expect(
      new FeaturesGuard(reflector(['modules'])).canActivate(context(true)),
    ).toBe(true);
  });

  it('denies direct API access without the Modules permission', () => {
    expect(() =>
      new FeaturesGuard(reflector(['modules'])).canActivate(context(false)),
    ).toThrow(ForbiddenException);
  });

  it('fails closed when protected metadata exists without authorization', () => {
    expect(() =>
      new FeaturesGuard(reflector(['modules'])).canActivate(context()),
    ).toThrow(ForbiddenException);
  });

  it('does not affect endpoints without feature metadata', () => {
    expect(
      new FeaturesGuard(reflector(undefined)).canActivate(context(false)),
    ).toBe(true);
  });
});
