import 'server-only';
import { redirect } from 'next/navigation';
import {
  resolveAdminAccess,
  type AuthorizationSupabaseClient,
} from '@/lib/authorization/resolve-admin-access';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AdminApiClient } from './client';

type AuthorizedAdminAccess = Extract<
  Awaited<ReturnType<typeof resolveAdminAccess>>,
  { status: 'authorized' }
>;

export interface AuthorizedAdminApiContext {
  access: AuthorizedAdminAccess;
  client: AdminApiClient;
}

interface SessionSupabaseClient extends AuthorizationSupabaseClient {
  auth: AuthorizationSupabaseClient['auth'] & {
    getSession(): Promise<{
      data: { session: { access_token: string } | null };
      error: unknown;
    }>;
  };
}

export async function createAuthorizedAdminApiContext(): Promise<AuthorizedAdminApiContext> {
  const supabase = (await createServerSupabaseClient()) as unknown as SessionSupabaseClient;
  const access = await resolveAdminAccess(supabase);

  if (access.status === 'unauthenticated') {
    redirect('/auth/sign-in');
  }

  if (access.status !== 'authorized') {
    redirect('/access-denied');
  }

  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    redirect('/auth/sign-in');
  }

  return {
    access,
    client: new AdminApiClient(data.session.access_token),
  };
}

export async function createAuthorizedAdminApiClient(): Promise<AdminApiClient> {
  return (await createAuthorizedAdminApiContext()).client;
}
