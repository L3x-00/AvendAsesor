import type { AiGatewayRequestLimits } from '../config/ai-gateway';

export interface EmbeddingsGateway {
  /** `limits` acota la espera cuando alguien aguarda la respuesta (chat). */
  embed(inputs: string[], limits?: AiGatewayRequestLimits): Promise<number[][]>;
}
