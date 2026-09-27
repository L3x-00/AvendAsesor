import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAiGatewayClient } from '../../config/ai-gateway';
import type { DocumentSummaryGateway } from './chat-catalog.types';

const TIMEOUT_MS = 12_000;
const MAX_SUMMARY_CHARS = 420;

const SYSTEM_PROMPT = [
  'Eres AVEND ASESOR, asistente del ámbito educativo peruano.',
  'Recibirás el título y el inicio del texto de un documento normativo.',
  'Escribe en español, en 1 o 2 oraciones (máximo 60 palabras), de qué trata el documento y para qué le sirve a un docente, auxiliar de educación o directivo.',
  'Usa SOLO lo que dice el texto: no inventes plazos, cifras, montos, requisitos ni nombres.',
  'No repitas el número de la norma. No uses viñetas ni comillas. Responde solo con el resumen.',
].join(' ');

/**
 * Un resumen no lleva cita: por eso no puede traer cifras (plazos, montos,
 * números de norma) que no aparezcan en el texto del documento.
 */
export function summaryStaysInSource(
  summary: string,
  excerpt: string,
): boolean {
  const numbers = summary.match(/\d+(?:[.,]\d+)*/gu) ?? [];
  return numbers.every((value) => excerpt.includes(value));
}

/** Limpia la salida del modelo; descarta lo vacío o demasiado largo. */
export function parseDocumentSummary(raw: string): string | null {
  const clean = raw
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/^["«“]+|["»”]+$/gu, '')
    .trim();
  if (clean.length < 20) return null;
  if (clean.length <= MAX_SUMMARY_CHARS) return clean;
  const cut = clean.slice(0, MAX_SUMMARY_CHARS);
  const lastStop = cut.lastIndexOf('.');
  return lastStop > 40 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`;
}

@Injectable()
export class OpenAiDocumentSummaryGateway implements DocumentSummaryGateway {
  constructor(private readonly configService: ConfigService) {}

  async summarize(input: {
    excerpt: string;
    title: string;
  }): Promise<string | null> {
    if (!input.excerpt.trim()) return null;
    const client = createAiGatewayClient(this.configService);
    const model =
      this.configService.get<string>('RAG_ANSWER_MODEL') ?? 'gpt-4o-mini';
    const completion = await client.chat.completions.create(
      {
        max_tokens: 200,
        messages: [
          { content: SYSTEM_PROMPT, role: 'system' },
          {
            content: `Título: ${input.title}\n\nTexto:\n${input.excerpt}`,
            role: 'user',
          },
        ],
        model,
        temperature: 0.2,
      },
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    const summary = parseDocumentSummary(
      completion.choices[0]?.message.content ?? '',
    );
    return summary && summaryStaysInSource(summary, input.excerpt)
      ? summary
      : null;
  }
}
