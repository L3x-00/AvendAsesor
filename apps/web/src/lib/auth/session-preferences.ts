/**
 * Preferencias de sesión del dispositivo, separadas de las cookies de Supabase.
 *
 * - `avend-remember`: "0" cuando la persona pidió NO mantener la sesión en
 *   este dispositivo. Las cookies de autenticación se emiten entonces como
 *   cookies de sesión (sin `maxAge`/`expires`) y el navegador las descarta al
 *   cerrarse. Ausente o "1" conserva el comportamiento persistente de Supabase.
 * - `avend-session`: marca que en este dispositivo hubo una sesión iniciada.
 *   Si una ruta protegida encuentra la marca pero ya no hay sesión válida, la
 *   sesión caducó (y no es una visita anónima): se avisa con calma en el login.
 *
 * Ninguna de las dos contiene datos personales ni secretos; la autoridad sigue
 * siendo la sesión de Supabase validada en el servidor.
 */
export const REMEMBER_COOKIE = 'avend-remember';
export const SESSION_MARKER_COOKIE = 'avend-session';

/** Un año: la preferencia del dispositivo no es un secreto. */
const PREFERENCE_MAX_AGE = 60 * 60 * 24 * 365;
/** Igual que el máximo de las cookies de `@supabase/ssr` (400 días). */
const PERSISTENT_SESSION_MAX_AGE = 60 * 60 * 24 * 400;

export const SESSION_EXPIRED_QUERY = 'sesion=caducada';
export const SIGN_IN_PATH = '/auth/sign-in';
export const SIGN_IN_EXPIRED_PATH = `${SIGN_IN_PATH}?${SESSION_EXPIRED_QUERY}`;

export interface CookieOptionsLike {
  expires?: Date | number | string;
  maxAge?: number;
  [key: string]: unknown;
}

export function shouldPersistSession(rememberValue: string | undefined): boolean {
  return rememberValue !== '0';
}

/**
 * Convierte las opciones de una cookie de autenticación en cookie de sesión
 * cuando la persona no pidió mantener la sesión. Una eliminación (`maxAge: 0`)
 * se respeta siempre: cerrar sesión debe borrar la cookie en cualquier caso.
 */
export function applySessionPersistence<T extends CookieOptionsLike>(
  options: T,
  persist: boolean,
): T {
  if (persist || options.maxAge === 0) return options;
  const sessionOnly = { ...options };
  delete sessionOnly.expires;
  delete sessionOnly.maxAge;
  return sessionOnly;
}

interface PreferenceCookie {
  name: string;
  options: {
    httpOnly: boolean;
    maxAge?: number;
    path: string;
    sameSite: 'lax';
    secure: boolean;
  };
  value: string;
}

/** Cookies a emitir tras un inicio de sesión correcto. */
export function sessionPreferenceCookies(
  persist: boolean,
  secure: boolean,
): PreferenceCookie[] {
  const base = { httpOnly: true, path: '/', sameSite: 'lax' as const, secure };
  return [
    {
      name: REMEMBER_COOKIE,
      options: { ...base, maxAge: PREFERENCE_MAX_AGE },
      value: persist ? '1' : '0',
    },
    {
      name: SESSION_MARKER_COOKIE,
      options: persist
        ? { ...base, maxAge: PERSISTENT_SESSION_MAX_AGE }
        : base,
      value: '1',
    },
  ];
}

/** Destino del login cuando falta la sesión, con aviso si caducó. */
export function signInPathFor(hadSession: boolean): string {
  return hadSession ? SIGN_IN_EXPIRED_PATH : SIGN_IN_PATH;
}
