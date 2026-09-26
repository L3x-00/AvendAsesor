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
/** Tras un fallo de la IA, cuánto se usan las preguntas de respaldo. */
export const FAILED_SUGGESTIONS_CACHE_MS = 2 * 60 * 1000;
/** Resumen de cobertura para «sin sustento»: se consulta la base como mucho cada 5 min. */
export const COVERAGE_CACHE_MS = 5 * 60 * 1000;
export const FAILED_COVERAGE_CACHE_MS = 60 * 1000;
const OTHER_TOPICS = 'otros temas';

function joinSpanish(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
}
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
  private coverage: { expiresAt: number; summary: string | null } | null = null;
  private inFlight: {
    promise: Promise<string[]>;
    signature: string;
  } | null = null;

  constructor(
    @Inject(SUPABASE_CHAT_CATALOG_GATEWAY)
    private readonly catalogGateway: ChatCatalogGateway,
    @Inject(SUGGESTED_QUESTIONS_GATEWAY)
    private readonly suggestionsGateway: SuggestedQuestionsGateway,
  ) {}

  /**
   * Una línea de asesor para cuando el RAG no encuentra sustento: qué temas
   * cubren hoy los documentos cargados y cómo ver la lista completa. Así el
   * docente sabe qué puede consultar en vez de quedarse sin orientación.
   */
  async coverageSummary(): Promise<string | null> {
    if (this.coverage && this.coverage.expiresAt > Date.now()) {
      return this.coverage.summary;
    }
    let documents: AvailableDocument[];
    try {
      documents = await this.catalogGateway.listAvailableDocuments();
    } catch (error) {
      // Un fallo se recuerda un minuto: cada «sin sustento» no debe esperar
      // a que la base vuelva a fallar.
      this.coverage = {
        expiresAt: Date.now() + FAILED_COVERAGE_CACHE_MS,
        summary: null,
      };
      throw error;
    }
    const counts = new Map<string, number>();
    for (const document of documents) {
      const topic = document.moduleNames[0] ?? OTHER_TOPICS;
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
    const topics = [...counts.entries()]
      // «otros temas» siempre al final.
      .sort(([left], [right]) =>
        left === OTHER_TOPICS
          ? 1
          : right === OTHER_TOPICS
            ? -1
            : left.localeCompare(right, 'es'),
      )
      .map(
        ([topic, count]) =>
          `${topic} (${count} ${count === 1 ? 'documento' : 'documentos'})`,
      );
    const summary = topics.length
      ? `Por ahora mis documentos cubren: ${joinSpanish(topics)}. Si quieres, pregúntame «¿De qué tienes información?» y te muestro la lista con preguntas recomendadas.`
      : null;
    this.coverage = { expiresAt: Date.now() + COVERAGE_CACHE_MS, summary };
    return summary;
  }

  async reply(abortSignal?: AbortSignal): Promise<ChatCatalogReply> {
    const documents = await this.catalogGateway.listAvailableDocuments();

    if (!documents.length) {
      return {
        message:
          'Por ahora no tengo documentos disponibles para responder consultas. Cuando la administración cargue y apruebe documentos, podrás preguntarme sobre ellos aquí mismo.',
        suggestions: [],
      };
    }

    const suggestions = await this.suggestionsFor(documents, abortSignal);
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
    abortSignal?: AbortSignal,
  ): Promise<string[]> {
    const signature = documents
      .map((document) => document.id)
      .sort()
      .join(',');
    if (
      this.cache &&
      this.cache.signature === signature &&
      this.cache.expiresAt > Date.now()
    ) {
      return this.cache.suggestions;
    }

    // Consultas simultáneas comparten una sola llamada a la IA.
    if (this.inFlight?.signature !== signature) {
      const promise = this.generate(documents, signature).finally(() => {
        if (this.inFlight?.promise === promise) this.inFlight = null;
      });
      this.inFlight = { promise, signature };
    }
    return raceAbort(this.inFlight.promise, abortSignal, () =>
      fallbackSuggestions(documents),
    );
  }

  /** Llama a la IA y guarda el resultado; un fallo se recuerda poco tiempo. */
  private async generate(
    documents: AvailableDocument[],
    signature: string,
  ): Promise<string[]> {
    let suggestions: string[] = [];
    try {
      suggestions = await this.suggestionsGateway.suggest(documents);
    } catch (error) {
      this.logger.warn(
        `No se pudieron generar preguntas sugeridas: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
    }
    const failed = !suggestions.length;
    const result = failed ? fallbackSuggestions(documents) : suggestions;
    // Una llamada vieja (el catálogo cambió mientras respondía) no pisa la nueva.
    const latest = this.inFlight?.signature ?? this.cache?.signature;
    if (latest && latest !== signature) return result;
    // Tras un fallo se usan las preguntas de respaldo un rato, para no hacer
    // esperar a cada docente mientras la IA no responde.
    this.cache = {
      expiresAt:
        Date.now() +
        (failed ? FAILED_SUGGESTIONS_CACHE_MS : SUGGESTIONS_CACHE_MS),
      signature,
      suggestions: result,
    };
    return result;
  }
}

/** Si el docente se va (señal abortada), no se espera a la IA. */
function raceAbort<T>(
  promise: Promise<T>,
  abortSignal: AbortSignal | undefined,
  onAbort: () => T,
): Promise<T> {
  if (!abortSignal) return promise;
  if (abortSignal.aborted) return Promise.resolve(onAbort());
  return new Promise<T>((resolve) => {
    const abort = () => resolve(onAbort());
    abortSignal.addEventListener('abort', abort, { once: true });
    // generate() nunca rechaza: los errores de la IA ya se convierten en respaldo.
    void promise.then((value) => {
      abortSignal.removeEventListener('abort', abort);
      resolve(value);
    });
  });
}
