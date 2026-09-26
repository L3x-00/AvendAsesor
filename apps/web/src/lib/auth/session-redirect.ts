import 'server-only';
import { cookies } from 'next/headers';
import { SESSION_MARKER_COOKIE, signInPathFor } from './session-preferences';

/**
 * Ruta de login adecuada cuando falta la sesión: si en este dispositivo había
 * una sesión iniciada, el login explica que caducó en vez de aparecer sin aviso.
 */
export async function resolveSignInPath(): Promise<string> {
  const cookieStore = await cookies();
  return signInPathFor(cookieStore.get(SESSION_MARKER_COOKIE)?.value === '1');
}
