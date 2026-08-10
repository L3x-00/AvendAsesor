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
]);

export function getAllowedAuthCallbackPath(candidate: string | null): string {
  const safePath = getSafeInternalPath(candidate, '/auth/code-error');

  return allowedAuthCallbackPaths.has(safePath) ? safePath : '/auth/code-error';
}

export function hasTrustedRequestOrigin(origin: string | null): boolean {
  return origin === getApplicationUrl().origin;
}
