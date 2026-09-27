import { HttpException } from '@nestjs/common';
import { classifyAiProviderFailure } from '../rag/ai-provider-failure';

/**
 * Traduce el fallo de un turno de chat a un código corto y seguro para el
 * seguimiento administrativo. Prioriza la causa del proveedor de IA y luego
 * distingue las fases de persistencia del turno. La persona usuaria siempre
 * recibe el mensaje genérico.
 */
export function classifyStreamFailure(error: unknown): string {
  const providerCode = classifyAiProviderFailure(error);
  if (providerCode) return providerCode;

  if (error instanceof HttpException) {
    if (/provider returned no answer/i.test(error.message)) {
      return 'AI_PROVIDER_EMPTY_ANSWER';
    }

    switch (error.getStatus()) {
      case 409:
        return 'CHAT_PERSISTENCE_CONFLICT';
      case 404:
        return 'CHAT_TURN_NOT_FOUND';
      case 400:
        return 'CHAT_TURN_REJECTED';
      case 403:
        return 'CHAT_NOT_AUTHORIZED';
      case 503:
        return 'CHAT_STORE_UNAVAILABLE';
      default:
        return 'CHAT_STREAM_FAILED';
    }
  }

  return 'CHAT_STREAM_FAILED';
}
