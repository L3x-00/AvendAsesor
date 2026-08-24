import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { EmbeddingsGateway } from './embeddings.gateway';

@Injectable()
export class OpenAiEmbeddingsGateway implements EmbeddingsGateway {
  constructor(private readonly configService: ConfigService) {}
  async embed(inputs: string[]): Promise<number[][]> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey)
      throw new ServiceUnavailableException(
        'The RAG provider is not configured.',
      );
    const response = await new OpenAI({ apiKey }).embeddings.create({
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
      embeddings.some((value) => value.length !== 1536)
    ) {
      throw new ServiceUnavailableException(
        'The RAG provider returned an invalid embedding response.',
      );
    }
    return embeddings;
  }
}
