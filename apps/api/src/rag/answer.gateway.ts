import type { RetrievedChunk } from './retrieval.gateway';
import type { ChatContextMessage } from '../chat/chat-history.gateway';

export interface AnswerGatewayInput {
  abortSignal?: AbortSignal;
  conversationContext: ChatContextMessage[];
  /**
   * Recibe el motivo de término del proveedor al cerrar el flujo ('stop',
   * 'length'…). Con 'length' la respuesta se cortó por el tope de tokens.
   */
  onFinish?: (reason: string | null) => void;
  question: string;
  sources: RetrievedChunk[];
}

export interface AnswerGateway {
  generate(input: AnswerGatewayInput): AsyncIterable<string>;
}
