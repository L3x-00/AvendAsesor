import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAiGatewayClient } from '../../config/ai-gateway';
import type {
  AvailableDocument,
  SuggestedQuestionsGateway,
} from './chat-catalog.types';

const MAX_SUGGESTIONS = 6;
const MAX_QUESTION_CHARS = 140;
const TIMEOUT_MS = 12_000;

const SYSTEM_PROMPT = [
  'Eres AVEND ASESOR, asistente del ámbito educativo peruano.',
  'Recibirás la lista de documentos disponibles (título, tipo, año y algunas secciones).',
  'Redacta entre 4 y 6 preguntas que un docente, auxiliar de educación o directivo haría y que ESOS documentos puedan responder.',
  'Reglas: cada pregunta en español, clara, de máximo 120 caracteres, que empiece con «¿» y termine con «?»;',
  'basadas solo en los títulos y secciones dados (no inventes normas, plazos ni cifras);',
  'no incluyas números de documento ni la respuesta; cubre documentos distintos.',
  'Responde SOLO con JSON: {"preguntas": ["¿...?", "¿...?"]}.',
].join(' ');

function documentsForPrompt(documents: AvailableDocument[]): string {
  return documents
    .slice(0, 25)
    .map((document, index) => {
      const sections = document.sectionTitles.length
        ? ` | Secciones: ${document.sectionTitles.join('; ')}`
        : '';
      const year = document.issuanceYear ? ` (${document.issuanceYear})` : '';
      return `${index + 1}. ${document.title}${year} | Tema: ${document.moduleNames.join(', ')}${sections}`;
    })
    .join('\n');
}

/** Valida y normaliza la salida del modelo; descarta lo que no sea una pregunta. */
export function parseSuggestedQuestions(raw: string): string[] {
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  const list =
    parsed && typeof parsed === 'object' && 'preguntas' in parsed
      ? parsed.preguntas
      : null;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  return list
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.replace(/\s+/gu, ' ').trim())
    .map((item) => (item.startsWith('¿') ? item : `¿${item}`))
    .map((item) => (item.endsWith('?') ? item : `${item}?`))
    .filter((item) => item.length >= 12 && item.length <= MAX_QUESTION_CHARS)
    .filter((item) => {
      const key = item.toLocaleLowerCase('es');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_SUGGESTIONS);
}

@Injectable()
export class OpenAiSuggestedQuestionsGateway implements SuggestedQuestionsGateway {
  constructor(private readonly configService: ConfigService) {}

  async suggest(documents: AvailableDocument[]): Promise<string[]> {
    if (!documents.length) return [];
    const client = createAiGatewayClient(this.configService);
    const model =
      this.configService.get<string>('RAG_ANSWER_MODEL') ?? 'gpt-4o-mini';
    const completion = await client.chat.completions.create(
      {
        max_tokens: 500,
        messages: [
          { content: SYSTEM_PROMPT, role: 'system' },
          { content: documentsForPrompt(documents), role: 'user' },
        ],
        model,
        response_format: { type: 'json_object' },
        temperature: 0.3,
      },
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    return parseSuggestedQuestions(
      completion.choices[0]?.message.content ?? '',
    );
  }
}
