import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/**
 * Dimensión fija de los vectores exigida por el esquema pgvector (`vector(1536)`).
 * No es configurable: cambiarla obligaría a un reindexado completo y a una
 * migración de columna, y rompería la compatibilidad con los vectores existentes.
 */
export const RAG_EMBEDDING_DIMENSIONS = 1536;

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Construye el cliente compatible con la API de OpenAI que actúa como gateway
 * único de IA. Prioriza OpenRouter cuando existe `OPENROUTER_API_KEY`; si no,
 * usa OpenAI directo con `OPENAI_API_KEY`. Falla de forma cerrada cuando no hay
 * ninguna credencial: nunca inventa una respuesta ni un proveedor.
 */
export function createAiGatewayClient(config: ConfigService): OpenAI {
  const openRouterKey = config.get<string>('OPENROUTER_API_KEY');

  if (openRouterKey) {
    return new OpenAI({
      apiKey: openRouterKey,
      baseURL:
        config.get<string>('AI_GATEWAY_BASE_URL') ??
        DEFAULT_OPENROUTER_BASE_URL,
      defaultHeaders: {
        'HTTP-Referer':
          config.get<string>('WEB_ORIGIN') ?? 'https://avend-asesor',
        'X-Title': 'AVEND ASESOR',
      },
    });
  }

  const openAiKey = config.get<string>('OPENAI_API_KEY');

  if (openAiKey) {
    const baseURL = config.get<string>('AI_GATEWAY_BASE_URL');
    return new OpenAI(
      baseURL ? { apiKey: openAiKey, baseURL } : { apiKey: openAiKey },
    );
  }

  throw new ServiceUnavailableException('The AI gateway is not configured.');
}
