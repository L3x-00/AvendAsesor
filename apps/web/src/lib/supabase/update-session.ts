import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import {
  applySessionPersistence,
  REMEMBER_COOKIE,
  SESSION_MARKER_COOKIE,
  shouldPersistSession,
  SIGN_IN_PATH,
} from '@/lib/auth/session-preferences';
import { getPublicSupabaseConfig } from './config';

export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { anonKey, url } = getPublicSupabaseConfig();
  // Si la persona no pidió mantener la sesión, el refresco del token tampoco
  // debe volver persistentes las cookies.
  const persist = shouldPersistSession(
    request.cookies.get(REMEMBER_COOKIE)?.value,
  );
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          request.cookies.set(cookie.name, cookie.value);
        }

        response = NextResponse.next({ request });

        for (const { name, options, value } of cookiesToSet) {
          response.cookies.set(
            name,
            value,
            applySessionPersistence(options, persist),
          );
        }
      },
    },
  });

  await supabase.auth.getClaims();

  // El aviso de "sesión caducada" se muestra una vez: al servirlo se retira la
  // marca, para que la portada vuelva a ser pública en las visitas siguientes.
  if (
    request.nextUrl.pathname === SIGN_IN_PATH &&
    request.nextUrl.searchParams.get('sesion') === 'caducada' &&
    request.cookies.has(SESSION_MARKER_COOKIE)
  ) {
    response.cookies.delete(SESSION_MARKER_COOKIE);
  }

  return response;
}
