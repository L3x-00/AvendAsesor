import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AiGatewayRequestLimits,
  RAG_EMBEDDING_DIMENSIONS,
  createAiGatewayClient,
} from '../config/ai-gateway';
import type { EmbeddingsGateway } from './embeddings.gateway';

/** Bound response decoding memory without changing tokenization or vectors. */
export const MAX_EMBEDDING_BATCH_SIZE = 32;

@Injectable()
export class OpenAiEmbeddingsGateway implements EmbeddingsGateway {
  constructor(private readonly configService: ConfigService) {}
  async embed(
    inputs: string[],
    limits?: AiGatewayRequestLimits,
    signal?: AbortSignal,
  ): Promise<number[][]> {
    signal?.throwIfAborted();
    if (!inputs.length) return [];
    const client = createAiGatewayClient(this.configService, limits);
    const model =
      this.configService.get<string>('RAG_EMBEDDING_MODEL') ??
      'text-embedding-3-small';
    const embeddings: number[][] = [];
    for (
      let offset = 0;
      offset < inputs.length;
      offset += MAX_EMBEDDING_BATCH_SIZE
    ) {
      signal?.throwIfAborted();
      const batch = inputs.slice(offset, offset + MAX_EMBEDDING_BATCH_SIZE);
      const response = await client.embeddings.create(
        { dimensions: RAG_EMBEDDING_DIMENSIONS, input: batch, model },
        { signal },
      );
      signal?.throwIfAborted();
      const ordered = response.data.sort((a, b) => a.index - b.index);
      if (
        ordered.length !== batch.length ||
        ordered.some(
          (item, index) =>
            item.index !== index ||
            item.embedding.length !== RAG_EMBEDDING_DIMENSIONS,
        )
      ) {
        throw new ServiceUnavailableException(
          'The RAG provider returned an invalid embedding response.',
        );
      }
      embeddings.push(...ordered.map((item) => item.embedding));
    }
    return embeddings;
  }
}
