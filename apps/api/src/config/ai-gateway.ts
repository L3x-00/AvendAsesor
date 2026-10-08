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

export interface AiGatewayRequestLimits {
  /** Reintentos ante 408/429/5xx o error de conexión. */
  maxRetries: number;
  /** Espera máxima hasta recibir la respuesta (en un stream, sus cabeceras). */
  timeout: number;
}

/**
 * Límites de las llamadas que hace esperar a una persona en el chat. Sin ellos
 * rigen los del SDK (10 minutos y dos reintentos con espera creciente): un
 * proveedor que no responde retenía la consulta varios minutos antes de caer al
 * modelo de respaldo o al aviso de error. La indexación conserva los del SDK:
 * embebe un documento entero en una sola llamada.
 */
export const INTERACTIVE_AI_LIMITS: AiGatewayRequestLimits = {
  maxRetries: 1,
  timeout: 30_000,
};

/**
 * Construye el cliente compatible con la API de OpenAI que actúa como gateway
 * único de IA. Prioriza OpenRouter cuando existe `OPENROUTER_API_KEY`; si no,
 * usa OpenAI directo con `OPENAI_API_KEY`. Falla de forma cerrada cuando no hay
 * ninguna credencial: nunca inventa una respuesta ni un proveedor.
 */
export function createAiGatewayClient(
  config: ConfigService,
  limits?: AiGatewayRequestLimits,
): OpenAI {
  const openRouterKey = config.get<string>('OPENROUTER_API_KEY');

  if (openRouterKey) {
    return new OpenAI({
      ...limits,
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
      baseURL
        ? { ...limits, apiKey: openAiKey, baseURL }
        : { ...limits, apiKey: openAiKey },
    );
  }

  throw new ServiceUnavailableException('The AI gateway is not configured.');
}
