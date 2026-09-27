import { HttpException } from '@nestjs/common';

const PROVIDER_STATUS_CODES: Record<number, string> = {
  401: 'AI_PROVIDER_AUTH',
  402: 'AI_PROVIDER_CREDITS',
  403: 'AI_PROVIDER_FORBIDDEN',
  404: 'AI_PROVIDER_MODEL_NOT_FOUND',
  408: 'AI_PROVIDER_TIMEOUT',
  429: 'AI_PROVIDER_RATE_LIMIT',
  504: 'AI_PROVIDER_TIMEOUT',
};

/**
 * Traduce el fallo del proveedor de IA a un código corto y seguro para el
 * seguimiento administrativo (la persona usuaria sigue viendo un mensaje
 * genérico). Devuelve `null` cuando el error no proviene del proveedor.
 */
export function classifyAiProviderFailure(error: unknown): string | null {
  if (error instanceof HttpException) {
    return /AI gateway is not configured/i.test(error.message)
      ? 'AI_GATEWAY_NOT_CONFIGURED'
      : null;
  }

  if (error && typeof error === 'object') {
    const name = (error as { name?: unknown }).name;
    if (name === 'APIConnectionTimeoutError') return 'AI_PROVIDER_TIMEOUT';
    if (name === 'APIConnectionError') return 'AI_PROVIDER_UNREACHABLE';
  }

  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== 'number' || !Number.isInteger(status)) {
    return null;
  }

  const known = PROVIDER_STATUS_CODES[status];
  if (known) return known;
  if (status >= 500) return 'AI_PROVIDER_UNAVAILABLE';
  return null;
}
