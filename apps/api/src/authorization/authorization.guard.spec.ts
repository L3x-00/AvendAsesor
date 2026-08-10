import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { AuthorizationGuard } from './authorization.guard';
import {
  type AuthorizationContext,
  type AuthorizationService,
} from './authorization.service';

function createContext(authorization?: string): {
  context: ExecutionContext;
  request: {
    headers: { authorization?: string };
    authorizationContext?: unknown;
  };
} {
  const request = { headers: { authorization } };

  return {
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
    request,
  };
}

function createService(emailConfirmedAt: string | null): {
  resolveContext: jest.MockedFunction<AuthorizationService['resolveContext']>;
  service: AuthorizationService;
} {
  const resolveContext = jest.fn().mockResolvedValue({
    email: 'admin@example.com',
    emailConfirmedAt,
    role: 'admin',
    userId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
  });

  return {
    resolveContext,
    service: { resolveContext } as unknown as AuthorizationService,
  };
}

describe('AuthorizationGuard', () => {
  it.each([undefined, '', 'Basic token', 'Bearer ', 'Bearer token another'])(
    'rejects malformed authorization header %#',
    async (authorization) => {
      const { resolveContext, service } = createService(
        '2026-08-09T00:00:00.000Z',
      );
      const guard = new AuthorizationGuard(service);
      const { context } = createContext(authorization);

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(resolveContext).not.toHaveBeenCalled();
    },
  );

  it('verifies a bearer token remotely and attaches its context to the request', async () => {
    const { resolveContext, service } = createService(
      '2026-08-09T00:00:00.000Z',
    );
    const guard = new AuthorizationGuard(service);
    const { context, request } = createContext('Bearer valid-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(resolveContext).toHaveBeenCalledWith('valid-token');
    expect(request.authorizationContext).toMatchObject({ role: 'admin' });
  });

  it('rejects identities that have not confirmed their email', async () => {
    const { service } = createService(null);
    const guard = new AuthorizationGuard(service);
    const { context } = createContext('Bearer valid-token');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('preserves a provider rejection for an expired or altered token', async () => {
    const resolveContext = jest
      .fn<Promise<AuthorizationContext>, [string]>()
      .mockRejectedValue(new UnauthorizedException());
    const guard = new AuthorizationGuard({
      resolveContext,
    } as unknown as AuthorizationService);
    const { context } = createContext('Bearer expired-token');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(resolveContext).toHaveBeenCalledWith('expired-token');
  });
});
