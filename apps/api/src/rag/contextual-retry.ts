import { treatsInheritedProcess } from './process-context';
import { RAG_QUERY_TEXT_MAX_CHARS } from './rag.constants';
import type { RetrievedChunk } from './retrieval.gateway';
import { normalizeSpanishText } from './text-normalization';
import type { TopicIntent } from './topic-intent';

/**
 * Reintento contextual del Paso 2. Es determinista: compone la pregunta con la
 * denominación del tema que el hilo ya abrió. No interpreta el lenguaje, no
 * llama al modelo de respuesta ni relaja el umbral global: solo propone una segunda
 * búsqueda cuando la primera no dejó evidencia admisible.
 */

export interface ContextualRetrySnapshot {
  attempts: number;
  improved: number;
  skippedTopicSwitch: number;
}

class ContextualRetryMetrics {
  private attempts = 0;
  private improved = 0;
  private skippedTopicSwitch = 0;

  /** Se llama cuando la segunda búsqueda se ejecuta, aunque vuelva vacía. */
  recordAttempt(): void {
    this.attempts += 1;
  }

  /** Se llama cuando esa búsqueda aportó evidencia admisible nueva. */
  recordImprovement(): void {
    this.improved += 1;
  }

  recordTopicSwitch(): void {
    this.skippedTopicSwitch += 1;
  }

  snapshot(): ContextualRetrySnapshot {
    return {
      attempts: this.attempts,
      improved: this.improved,
      skippedTopicSwitch: this.skippedTopicSwitch,
    };
  }

  reset(): void {
    this.attempts = 0;
    this.improved = 0;
    this.skippedTopicSwitch = 0;
  }
}

/** Contadores del proceso, consultables en pruebas y en logs; sin PII. */
export const contextualRetryMetrics = new ContextualRetryMetrics();

/**
 * Consulta del segundo intento. El tema va primero para que la similitud no
 * quede dominada por un seguimiento elíptico de dos palabras. Si la pregunta ya
 * contiene la denominación canónica, se devuelve tal cual: repetirla no aporta
 * señal y solo alargaría el embedding.
 */
export function buildContextualRetryQuery(
  question: string,
  strongTopicQuery: string,
): string {
  const topic = strongTopicQuery.trim();
  const original = question.trim();
  if (!topic || !original) return original || topic;
  const normalizedTopic = normalizeSpanishText(topic);
  const normalizedQuestion = normalizeSpanishText(original);
  if (normalizedQuestion.includes(normalizedTopic)) return original;
  const combined = `${topic} ${original}`;
  return combined.length <= RAG_QUERY_TEXT_MAX_CHARS
    ? combined
    : combined.slice(0, RAG_QUERY_TEXT_MAX_CHARS);
}

/**
 * ¿La segunda búsqueda presenta un tema distinto con ventaja suficiente? En ese
 * caso no se fuerza la herencia del hilo: manda la evidencia nueva, con el mismo
 * margen que ya usa el motor para declarar un cambio de tema.
 */
export function retryIndicatesTopicSwitch(input: {
  inheritedIntent: TopicIntent | null;
  margin: number;
  question: string;
  sources: readonly RetrievedChunk[];
}): boolean {
  const { inheritedIntent, margin, sources } = input;
  if (!inheritedIntent || !sources.length) return false;
  let ownScore = 0;
  let otherScore = 0;
  for (const source of sources) {
    const score = source.semanticScore ?? 0;
    // El reintento es la búsqueda del proceso: un fragmento que no repite su
    // nombre pero llegó por esa consulta cuenta como evidencia del tema. Solo
    // hay cambio de tema cuando además otro asunto gana por el margen acordado.
    if (treatsInheritedProcess(inheritedIntent, source, true)) {
      ownScore = Math.max(ownScore, score);
    } else {
      otherScore = Math.max(otherScore, score);
    }
  }
  return otherScore > 0 && otherScore - ownScore >= margin;
}
