import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type OpenAI from 'openai';
import { createAiGatewayClient } from '../config/ai-gateway';
import type { AnswerGateway, AnswerGatewayInput } from './answer.gateway';
import {
  buildEvidenceSystemPrompt,
  buildEvidenceUserPrompt,
} from './prompt.builder';

@Injectable()
export class OpenAiAnswerGateway implements AnswerGateway {
  constructor(private readonly configService: ConfigService) {}

  async *generate(input: AnswerGatewayInput): AsyncIterable<string> {
    const client = createAiGatewayClient(this.configService);
    const primaryModel =
      this.configService.get<string>('RAG_ANSWER_MODEL') ?? 'gpt-4o-mini';
    const fallbackModel = this.configService.get<string>(
      'RAG_ANSWER_FALLBACK_MODEL',
    );

    const stream = await this.createStream(client, input, primaryModel).catch(
      (error: unknown) => {
        // Fallback SOLO ante error técnico del proveedor primario (límite, caída
        // o modelo inválido). Nunca por falta de evidencia o ambigüedad: esas
        // decisiones se toman antes de llegar aquí. Tampoco si se abortó.
        if (
          !fallbackModel ||
          fallbackModel === primaryModel ||
          input.abortSignal?.aborted
        ) {
          throw error;
        }
        return this.createStream(client, input, fallbackModel);
      },
    );

    for await (const part of stream) {
      const token = part.choices[0]?.delta.content;

      if (token) {
        yield token;
      }
    }
  }

  private createStream(
    client: OpenAI,
    input: AnswerGatewayInput,
    model: string,
  ) {
    return client.chat.completions.create(
      {
        messages: [
          { content: buildEvidenceSystemPrompt(), role: 'system' },
          {
            content: buildEvidenceUserPrompt(
              input.question,
              input.conversationContext,
              input.sources,
            ),
            role: 'user',
          },
        ],
        model,
        stream: true,
        temperature: 0,
      },
      { signal: input.abortSignal },
    );
  }
}
