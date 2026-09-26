import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  applySessionPersistence,
  REMEMBER_COOKIE,
  shouldPersistSession,
} from '@/lib/auth/session-preferences';
import { getPublicSupabaseConfig } from './config';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const { anonKey, url } = getPublicSupabaseConfig();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Se lee en cada escritura: el inicio de sesión fija la preferencia
        // justo antes de que Supabase emita sus cookies.
        const persist = shouldPersistSession(
          cookieStore.get(REMEMBER_COOKIE)?.value,
        );
        for (const { name, options, value } of cookiesToSet) {
          cookieStore.set(
            name,
            value,
            applySessionPersistence(options, persist),
          );
        }
      },
    },
  });
}
