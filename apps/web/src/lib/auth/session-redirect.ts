import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_MARKER_COOKIE, signInPathFor } from './session-preferences';

/** Ruta de login adecuada: con aviso de sesión caducada si hubo una sesión. */
export async function resolveSignInPath(): Promise<string> {
  const cookieStore = await cookies();
  return signInPathFor(cookieStore.get(SESSION_MARKER_COOKIE)?.value === '1');
}

/**
 * Redirige al login cuando falta la sesión. Si en este dispositivo había una
 * sesión iniciada, el login explica que caducó en vez de aparecer sin aviso.
 */
export async function redirectToSignIn(): Promise<never> {
  redirect(await resolveSignInPath());
}
