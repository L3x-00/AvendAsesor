import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { AnswerGateway, AnswerGatewayInput } from './answer.gateway';
import { buildEvidenceSystemPrompt } from './prompt.builder';

@Injectable()
export class OpenAiAnswerGateway implements AnswerGateway {
  constructor(private readonly configService: ConfigService) {}

  async *generate(input: AnswerGatewayInput): AsyncIterable<string> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      throw new ServiceUnavailableException(
        'The RAG answer provider is not configured.',
      );
    }

    const stream = await new OpenAI({ apiKey }).chat.completions.create(
      {
        messages: [
          { content: buildEvidenceSystemPrompt(input.sources), role: 'system' },
          { content: input.question, role: 'user' },
        ],
        model:
          this.configService.get<string>('RAG_ANSWER_MODEL') ?? 'gpt-4o-mini',
        stream: true,
        temperature: 0,
      },
      { signal: input.abortSignal },
    );

    for await (const part of stream) {
      const token = part.choices[0]?.delta.content;

      if (token) {
        yield token;
      }
    }
  }
}
