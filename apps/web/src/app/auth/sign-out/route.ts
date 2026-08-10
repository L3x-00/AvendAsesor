import { type NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/auth/auth-service';
import { hasTrustedRequestOrigin } from '@/lib/auth/site-url';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  if (!hasTrustedRequestOrigin(request.headers.get('origin'))) {
    return new NextResponse(null, { status: 403 });
  }

  const authService = new AuthService(await createServerSupabaseClient());

  await authService.signOut();

  return NextResponse.redirect(new URL('/auth/sign-in', request.url), 303);
}
