const developmentFallbackUrl = 'http://localhost:3000';

export function getApplicationUrl(
  environment: Record<string, string | undefined> = process.env,
): URL {
  const configuredUrl = environment.APP_URL;
  const rawUrl =
    configuredUrl ||
    (environment.NODE_ENV === 'production' ? undefined : developmentFallbackUrl);

  if (!rawUrl) {
    throw new Error('APP_URL must be configured outside local development.');
  }

  const url = new URL(rawUrl);
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

  if (url.protocol !== 'https:' && !isLocalhost) {
    throw new Error('APP_URL must use HTTPS outside local development.');
  }

  return url;
}

export function getAuthRedirectUrl(path: string): string {
  if (!path.startsWith('/auth/')) {
    throw new Error('Authentication redirects must stay under /auth/.');
  }

  return new URL(path, getApplicationUrl()).toString();
}

export function getSafeInternalPath(
  candidate: string | null,
  fallback: string,
): string {
  if (
    !candidate ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\')
  ) {
    return fallback;
  }

  return candidate;
}

const allowedAuthCallbackPaths = new Set([
  '/auth/confirmed',
  '/auth/update-password',
  '/profile',
]);

export function getAllowedAuthCallbackPath(candidate: string | null): string {
  const safePath = getSafeInternalPath(candidate, '/auth/code-error');

  return allowedAuthCallbackPaths.has(safePath) ? safePath : '/auth/code-error';
}

/**
 * Destino de los enlaces del cambio de correo. Solo ese flujo vuelve a Mi
 * perfil, así que el callback lo reconoce por este `next`.
 */
export const EMAIL_CHANGE_RETURN_PATH = '/profile';

/**
 * Resultado del cambio de correo que Mi perfil explica con un aviso:
 * - `actualizado`: el enlace final se canjeó en este navegador.
 * - `pendiente`: se aceptó el primero de los dos enlaces (doble confirmación).
 * - `revisar`: el canje falló (otro dispositivo, sesión cerrada); el cambio
 *   pudo completarse igual, porque Auth lo aplica al verificar el enlace.
 * - `error`: Auth rechazó el enlace (vencido, ya usado o no válido).
 */
export const emailChangeOutcomes = [
  'actualizado',
  'pendiente',
  'revisar',
  'error',
] as const;

export type EmailChangeOutcome = (typeof emailChangeOutcomes)[number];

export function getEmailChangeResultPath(outcome: EmailChangeOutcome): string {
  return `${EMAIL_CHANGE_RETURN_PATH}?correo=${outcome}`;
}

/**
 * Página pública con el resultado del cambio de correo. Mi perfil exige
 * sesión, y el inicio de sesión no conoce el aviso: quien abre el enlace en
 * otro dispositivo o con la sesión cerrada (justo el caso `revisar`) llega
 * aquí para que el resultado no se pierda.
 */
export const EMAIL_CHANGE_PUBLIC_RESULT_PATH = '/auth/callback/correo';

export function getEmailChangePublicResultPath(outcome: EmailChangeOutcome): string {
  return `${EMAIL_CHANGE_PUBLIC_RESULT_PATH}?resultado=${outcome}`;
}

export function parseEmailChangeOutcome(value: unknown): EmailChangeOutcome | null {
  return typeof value === 'string' &&
    (emailChangeOutcomes as readonly string[]).includes(value)
    ? (value as EmailChangeOutcome)
    : null;
}

export function hasTrustedRequestOrigin(origin: string | null): boolean {
  return origin === getApplicationUrl().origin;
}
