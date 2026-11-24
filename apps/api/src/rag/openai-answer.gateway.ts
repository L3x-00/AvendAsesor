import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type OpenAI from 'openai';
import {
  INTERACTIVE_AI_LIMITS,
  createAiGatewayClient,
} from '../config/ai-gateway';
import type { AnswerGateway, AnswerGatewayInput } from './answer.gateway';
import { asksForDates } from './dated-evidence';
import { isLegalModuleName, isLegalQuestion } from './legal-retrieval';
import {
  buildAdvisorySystemPrompt,
  buildAdvisoryUserPrompt,
  buildEvidenceSystemPrompt,
  buildEvidenceUserPrompt,
  buildSummarySystemPrompt,
  buildSummaryUserPrompt,
} from './prompt.builder';
import {
  MAX_RAG_ADVISORY_TOKENS,
  MAX_RAG_ANSWER_TOKENS,
  MAX_RAG_SUMMARY_TOKENS,
} from './rag.constants';

@Injectable()
export class OpenAiAnswerGateway implements AnswerGateway {
  constructor(private readonly configService: ConfigService) {}

  async *generate(input: AnswerGatewayInput): AsyncIterable<string> {
    const client = createAiGatewayClient(
      this.configService,
      INTERACTIVE_AI_LIMITS,
    );
    const advisory = input.mode === 'advisory';
    const summary = input.mode === 'summary';
    const primaryModel =
      (summary
        ? (this.configService.get<string>('RAG_SUMMARY_MODEL') ??
          this.configService.get<string>('RAG_ANSWER_MODEL'))
        : this.configService.get<string>(
            advisory ? 'RAG_ADVISORY_MODEL' : 'RAG_ANSWER_MODEL',
          )) ?? 'gpt-4o-mini';
    // La conversación social usa modelos gratuitos y, si ambos fallan, el
    // modelo pagado de respaldo: así un saludo no se cae por el límite del
    // proveedor gratuito. Los resúmenes usan un modelo económico con respaldo
    // al modelo del RAG. Este último mantiene su par pagado principal/respaldo.
    const configuredFallbacks = summary
      ? [this.configService.get<string>('RAG_ANSWER_MODEL')]
      : advisory
        ? [
            this.configService.get<string>('RAG_ADVISORY_FALLBACK_MODEL'),
            this.configService.get<string>('RAG_ANSWER_FALLBACK_MODEL'),
          ]
        : [this.configService.get<string>('RAG_ANSWER_FALLBACK_MODEL')];
    const models = [
      primaryModel,
      ...new Set(
        configuredFallbacks.filter(
          (candidate): candidate is string =>
            Boolean(candidate) && candidate !== primaryModel,
        ),
      ),
    ];

    let stream:
      Awaited<ReturnType<OpenAiAnswerGateway['createStream']>> | undefined;
    let lastError: unknown;
    for (const model of models) {
      try {
        stream = await this.createStream(client, input, model);
        break;
      } catch (error) {
        // Fallback SOLO ante error técnico del proveedor (límite, caída o
        // modelo inválido), nunca por falta de evidencia o ambigüedad, y nunca
        // después de abortar. Los tokens solo se emiten cuando un stream abre.
        if (input.abortSignal?.aborted) throw error;
        lastError = error;
      }
    }
    if (!stream) throw lastError;

    let finishReason: string | null = null;
    for await (const part of stream) {
      const choice = part.choices[0];
      const token = choice?.delta.content;
      finishReason = choice?.finish_reason ?? finishReason;

      if (token) {
        yield token;
      }
    }
    input.onFinish?.(finishReason);
  }

  private createStream(
    client: OpenAI,
    input: AnswerGatewayInput,
    model: string,
  ) {
    const mode = input.mode ?? 'grounded';
    const systemPrompt =
      input.systemPromptOverride ??
      (mode === 'summary'
        ? buildSummarySystemPrompt()
        : mode === 'advisory'
          ? buildAdvisorySystemPrompt()
          : buildEvidenceSystemPrompt({
              asksForDates: asksForDates(input.question),
              asksForLegalQuestion:
                isLegalQuestion(input.question) &&
                isLegalModuleName(input.selectedModuleName),
            }));
    const userPrompt =
      mode === 'summary'
        ? buildSummaryUserPrompt(input.question, input.conversationContext)
        : mode === 'advisory'
          ? buildAdvisoryUserPrompt(input.question, input.conversationContext)
          : buildEvidenceUserPrompt(
              input.question,
              input.conversationContext,
              input.sources,
              input.topicContext,
            );
    return client.chat.completions.create(
      {
        messages: [
          {
            content: systemPrompt,
            role: 'system',
          },
          {
            content: userPrompt,
            role: 'user',
          },
        ],
        model,
        stream: true,
        temperature: mode === 'grounded' ? 0 : mode === 'summary' ? 0.2 : 0.4,
        max_tokens:
          mode === 'summary'
            ? MAX_RAG_SUMMARY_TOKENS
            : mode === 'advisory'
              ? MAX_RAG_ADVISORY_TOKENS
              : MAX_RAG_ANSWER_TOKENS,
      },
      { signal: input.abortSignal },
    );
  }
}
