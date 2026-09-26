import { type NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/auth/auth-service';
import { SESSION_MARKER_COOKIE } from '@/lib/auth/session-preferences';
import { hasTrustedRequestOrigin } from '@/lib/auth/site-url';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  if (!hasTrustedRequestOrigin(request.headers.get('origin'))) {
    return new NextResponse(null, { status: 403 });
  }

  const authService = new AuthService(await createServerSupabaseClient());

  await authService.signOut();

  const response = NextResponse.redirect(
    new URL('/auth/sign-in', request.url),
    303,
  );
  // Cierre voluntario: el próximo login no debe decir que la sesión caducó.
  response.cookies.delete(SESSION_MARKER_COOKIE);
  return response;
}
