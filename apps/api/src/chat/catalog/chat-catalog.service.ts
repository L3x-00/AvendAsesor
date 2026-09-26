import { Inject, Injectable, Logger } from '@nestjs/common';
import { SUPABASE_CHAT_CATALOG_GATEWAY } from '../../supabase/supabase.constants';
import {
  SUGGESTED_QUESTIONS_GATEWAY,
  type AvailableDocument,
  type ChatCatalogGateway,
  type ChatCatalogReply,
  type SuggestedQuestionsGateway,
} from './chat-catalog.types';

/** Las sugerencias se regeneran solo si cambia el catálogo o pasa este tiempo. */
export const SUGGESTIONS_CACHE_MS = 30 * 60 * 1000;
const MAX_LISTED_DOCUMENTS = 25;
const MAX_FALLBACK_SUGGESTIONS = 4;
const SHORT_TITLE_CHARS = 70;

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  ANEXO: 'Anexo',
  COMUNICADO: 'Comunicado',
  CRONOGRAMA: 'Cronograma',
  DECRETO_LEGISLATIVO: 'Decreto Legislativo',
  DECRETO_SUPREMO: 'Decreto Supremo',
  DIRECTIVA: 'Directiva',
  INFOGRAFIA: 'Infografía',
  INFORME: 'Informe',
  LEY: 'Ley',
  MEMORANDUM: 'Memorándum',
  NORMA_TECNICA: 'Norma Técnica',
  OFICIO: 'Oficio',
  REGLAMENTO: 'Reglamento',
  RESOLUCION_DIRECTORAL: 'Resolución Directoral',
  RESOLUCION_MINISTERIAL: 'Resolución Ministerial',
  RESOLUCION_VICEMINISTERIAL: 'Resolución Viceministerial',
};

function shortTitle(title: string): string {
  const clean = title
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[.;:]+$/u, '');
  if (clean.length <= SHORT_TITLE_CHARS) return clean;
  const cut = clean.slice(0, SHORT_TITLE_CHARS);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/u, '')}…`;
}

function documentLine(document: AvailableDocument): string {
  const details = [
    DOCUMENT_TYPE_LABELS[document.documentType],
    document.resolutionNumber,
    document.issuanceYear ? String(document.issuanceYear) : null,
  ].filter(Boolean);
  // Sin el punto final del título: quedaría «contratados. (Resolución…)».
  const title = document.title.trim().replace(/[.;:]+$/u, '');
  return `- ${title}${details.length ? ` (${details.join(', ')})` : ''}`;
}

/**
 * Preguntas de respaldo si la IA no responde: no afirman contenido, solo
 * invitan a consultar un documento concreto por su nombre.
 */
export function fallbackSuggestions(documents: AvailableDocument[]): string[] {
  return documents
    .slice(0, MAX_FALLBACK_SUGGESTIONS)
    .map((document) => `¿Qué establece «${shortTitle(document.title)}»?`);
}

/**
 * Arma la respuesta a «¿de qué tienes información?»: los documentos que el
 * asistente puede citar hoy, agrupados por tema, y preguntas recomendadas
 * redactadas por la IA a partir de ellos (con caché y respaldo sin IA).
 */
@Injectable()
export class ChatCatalogService {
  private readonly logger = new Logger(ChatCatalogService.name);
  private cache: {
    expiresAt: number;
    signature: string;
    suggestions: string[];
  } | null = null;

  constructor(
    @Inject(SUPABASE_CHAT_CATALOG_GATEWAY)
    private readonly catalogGateway: ChatCatalogGateway,
    @Inject(SUGGESTED_QUESTIONS_GATEWAY)
    private readonly suggestionsGateway: SuggestedQuestionsGateway,
  ) {}

  async reply(): Promise<ChatCatalogReply> {
    const documents = await this.catalogGateway.listAvailableDocuments();

    if (!documents.length) {
      return {
        message:
          'Por ahora no tengo documentos disponibles para responder consultas. Cuando la administración cargue y apruebe documentos, podrás preguntarme sobre ellos aquí mismo.',
        suggestions: [],
      };
    }

    const suggestions = await this.suggestionsFor(documents);
    return { message: this.buildMessage(documents, suggestions), suggestions };
  }

  private buildMessage(
    documents: AvailableDocument[],
    suggestions: string[],
  ): string {
    // Cada documento se lista una vez, bajo su primer tema.
    const byTopic = new Map<string, AvailableDocument[]>();
    for (const document of documents.slice(0, MAX_LISTED_DOCUMENTS)) {
      const topic = document.moduleNames[0] ?? 'Otros temas';
      byTopic.set(topic, [...(byTopic.get(topic) ?? []), document]);
    }

    const count = documents.length;
    const intro = `¡Claro! Hoy puedo responderte con ${count === 1 ? 'este documento' : `estos ${count} documentos`}, organizados por tema:`;
    const sections = [...byTopic.entries()]
      .sort(([left], [right]) => left.localeCompare(right, 'es'))
      .map(
        ([topic, items]) =>
          `**${topic}**\n${items.map((item) => documentLine(item)).join('\n')}`,
      );
    const more =
      count > MAX_LISTED_DOCUMENTS
        ? [`Y ${count - MAX_LISTED_DOCUMENTS} documentos más.`]
        : [];
    const closing = suggestions.length
      ? 'Te dejo algunas preguntas recomendadas para empezar: tócalas para usarlas o escribe la tuya con el mayor detalle posible.'
      : 'Cuéntame tu consulta con el mayor detalle posible y la busco en estos documentos.';

    return [intro, ...sections, ...more, closing].join('\n\n');
  }

  private async suggestionsFor(
    documents: AvailableDocument[],
  ): Promise<string[]> {
    const signature = documents
      .map((document) => document.id)
      .sort()
      .join(',');
    const now = Date.now();
    if (
      this.cache &&
      this.cache.signature === signature &&
      this.cache.expiresAt > now
    ) {
      return this.cache.suggestions;
    }

    let suggestions: string[] = [];
    try {
      suggestions = await this.suggestionsGateway.suggest(documents);
    } catch (error) {
      this.logger.warn(
        `No se pudieron generar preguntas sugeridas: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
    }
    if (!suggestions.length) {
      // Sin caché: si la IA falló, se reintenta en la próxima consulta.
      return fallbackSuggestions(documents);
    }

    this.cache = {
      expiresAt: now + SUGGESTIONS_CACHE_MS,
      signature,
      suggestions,
    };
    return suggestions;
  }
}
