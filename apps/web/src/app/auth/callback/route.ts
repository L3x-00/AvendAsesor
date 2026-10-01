import { type NextRequest, NextResponse } from 'next/server';
import {
  EMAIL_CHANGE_RETURN_PATH,
  getAllowedAuthCallbackPath,
  getEmailChangePublicResultPath,
  getEmailChangeResultPath,
  type EmailChangeOutcome,
} from '@/lib/auth/site-url';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Cambio de correo con doble confirmación (Mi perfil).
 *
 * Auth aplica el cambio al VERIFICAR cada enlace, antes de redirigir aquí. Por
 * eso ninguna de estas salidas puede terminar en «No pudimos validar el
 * enlace», que además ofrece recuperar la contraseña:
 * - El primer enlace llega sin `code` y con `message` («falta el otro»).
 * - Un enlace vencido o ya usado llega con `error`/`error_description`.
 * - El canje del último enlace necesita el verificador PKCE que guardó ESTE
 *   navegador. Si se abrió en otro dispositivo o se cerró la sesión, el canje
 *   falla aunque el correo ya haya cambiado: se pide revisar, no se afirma un
 *   error.
 *
 * Mi perfil exige sesión. Si este navegador no la tiene (justo lo habitual en
 * `revisar`), el aviso se perdería en el inicio de sesión; por eso esos casos
 * van a una página pública que explica el resultado y ofrece iniciar sesión.
 */
type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

async function resolveEmailChangeOutcome(
  params: URLSearchParams,
  supabase: ServerSupabaseClient | null,
): Promise<EmailChangeOutcome> {
  if (
    params.has('error') ||
    params.has('error_code') ||
    params.has('error_description')
  ) {
    return 'error';
  }

  const code = params.get('code');
  if (!code) return params.get('message') ? 'pendiente' : 'error';
  if (!supabase) return 'revisar';

  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? 'revisar' : 'actualizado';
  } catch {
    return 'revisar';
  }
}

/** Ante cualquier fallo se asume que no hay sesión: la página pública sirve igual. */
async function hasSession(supabase: ServerSupabaseClient | null): Promise<boolean> {
  if (!supabase) return false;

  try {
    const { data, error } = await supabase.auth.getUser();
    return !error && Boolean(data.user);
  } catch {
    return false;
  }
}

async function emailChangeResultPath(params: URLSearchParams): Promise<string> {
  let supabase: ServerSupabaseClient | null = null;
  try {
    supabase = await createServerSupabaseClient();
  } catch {
    supabase = null;
  }

  const outcome = await resolveEmailChangeOutcome(params, supabase);

  // Un canje correcto acaba de crear la sesión: Mi perfil puede mostrar el aviso.
  if (outcome === 'actualizado' || (await hasSession(supabase))) {
    return getEmailChangeResultPath(outcome);
  }

  return getEmailChangePublicResultPath(outcome);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = getAllowedAuthCallbackPath(params.get('next'));

  if (next === EMAIL_CHANGE_RETURN_PATH) {
    return NextResponse.redirect(
      new URL(await emailChangeResultPath(params), request.url),
    );
  }

  const code = params.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/auth/code-error', request.url));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL('/auth/code-error', request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
