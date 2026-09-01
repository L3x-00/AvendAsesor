import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getSession = vi.fn();

  return {
    createServerSupabaseClient: vi.fn(async () => ({
      auth: { getSession },
    })),
    getSession,
    redirect: vi.fn((destination: string): never => {
      throw new Error(`REDIRECT:${destination}`);
    }),
    resolveAdminAccess: vi.fn(),
  };
});

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));
vi.mock('@/lib/authorization/resolve-admin-access', () => ({
  resolveAdminAccess: mocks.resolveAdminAccess,
}));

import {
  createAuthorizedAdminApiClient,
  createAuthorizedAdminApiContext,
} from './authorized-client';

describe('authorized administrative API client', () => {
  beforeEach(() => {
    process.env.ADMIN_API_URL = 'http://localhost:3001';
    mocks.redirect.mockClear();
    mocks.createServerSupabaseClient.mockClear();
    mocks.resolveAdminAccess.mockClear();
    mocks.getSession.mockClear();
  });

  it('creates a context with the authorized identity and API client', async () => {
    const access = {
      fullName: 'María Administradora',
      role: 'admin' as const,
      status: 'authorized' as const,
      userId: 'user-1',
    };
    mocks.resolveAdminAccess.mockResolvedValue(access);
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'verified-token' } },
      error: null,
    });

    const context = await createAuthorizedAdminApiContext();

    expect(context.access).toEqual(access);
    expect(context.client).toBeDefined();
    expect(mocks.resolveAdminAccess).toHaveBeenCalledTimes(1);
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
  });

  it('keeps the client-only helper compatible for existing server actions', async () => {
    mocks.resolveAdminAccess.mockResolvedValue({
      fullName: 'María Administradora',
      role: 'admin',
      status: 'authorized',
      userId: 'user-1',
    });
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'verified-token' } },
      error: null,
    });

    await expect(createAuthorizedAdminApiClient()).resolves.toBeDefined();
    expect(mocks.resolveAdminAccess).toHaveBeenCalledTimes(1);
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
  });

  it('redirects unauthenticated and unauthorized callers before creating a backend client', async () => {
    mocks.resolveAdminAccess.mockResolvedValue({ status: 'unauthenticated' });

    await expect(createAuthorizedAdminApiClient()).rejects.toThrow(
      'REDIRECT:/auth/sign-in',
    );

    mocks.resolveAdminAccess.mockResolvedValue({ status: 'unauthorized' });
    await expect(createAuthorizedAdminApiClient()).rejects.toThrow(
      'REDIRECT:/access-denied',
    );
  });

  it('redirects when an otherwise-authorized caller has no usable session', async () => {
    mocks.resolveAdminAccess.mockResolvedValue({
      fullName: 'Juan Superadministrador',
      role: 'superadmin',
      status: 'authorized',
      userId: 'user-1',
    });
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(createAuthorizedAdminApiClient()).rejects.toThrow(
      'REDIRECT:/auth/sign-in',
    );
  });
});
