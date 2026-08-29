import 'server-only';

function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost';
}

export function getAdminApiUrl(
  environment: Record<string, string | undefined> = process.env,
): string {
  const value = environment.ADMIN_API_URL;

  if (!value) {
    throw new Error('Administrative API configuration is incomplete.');
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('Administrative API configuration is invalid.');
  }

  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && isLoopbackHost(url.hostname))
  ) {
    throw new Error('Administrative API configuration is invalid.');
  }

  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Administrative API configuration is invalid.');
  }

  return url.origin;
}
