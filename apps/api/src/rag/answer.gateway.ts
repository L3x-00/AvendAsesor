import type { RetrievedChunk } from './retrieval.gateway';
import type { ChatContextMessage } from '../chat/chat-history.gateway';
import type { InternalTopicContext } from './topic-context';

export interface AnswerGatewayInput {
  abortSignal?: AbortSignal;
  conversationContext: ChatContextMessage[];
  /**
   * `grounded`: respuesta sustentada solo con las fuentes (por defecto).
   * `advisory`: orientación general sin fuentes, sin citar normas ni cifras.
   * `summary`: resumen de la conversación, sin fuentes y sin hechos nuevos.
   */
  mode?: 'grounded' | 'advisory' | 'summary';
  /**
   * Recibe el motivo de término del proveedor al cerrar el flujo ('stop',
   * 'length'…). Con 'length' la respuesta se cortó por el tope de tokens.
   */
  onFinish?: (reason: string | null) => void;
  question: string;
  sources: RetrievedChunk[];
  /** Módulo elegido, para aplicar políticas propias de su ámbito. */
  selectedModuleName?: string | null;
  /** Contexto auxiliar del tema elegido; nunca respalda ni cita hechos. */
  topicContext?: InternalTopicContext | null;
}

export interface AnswerGateway {
  generate(input: AnswerGatewayInput): AsyncIterable<string>;
}
