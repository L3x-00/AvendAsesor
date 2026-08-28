import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RAG_EMBEDDING_DIMENSIONS,
  createAiGatewayClient,
} from '../config/ai-gateway';
import type { EmbeddingsGateway } from './embeddings.gateway';

@Injectable()
export class OpenAiEmbeddingsGateway implements EmbeddingsGateway {
  constructor(private readonly configService: ConfigService) {}
  async embed(inputs: string[]): Promise<number[][]> {
    const client = createAiGatewayClient(this.configService);
    const response = await client.embeddings.create({
      dimensions: RAG_EMBEDDING_DIMENSIONS,
      input: inputs,
      model:
        this.configService.get<string>('RAG_EMBEDDING_MODEL') ??
        'text-embedding-3-small',
    });
    const embeddings = response.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
    if (
      embeddings.length !== inputs.length ||
      embeddings.some((value) => value.length !== RAG_EMBEDDING_DIMENSIONS)
    ) {
      throw new ServiceUnavailableException(
        'The RAG provider returned an invalid embedding response.',
      );
    }
    return embeddings;
  }
}
