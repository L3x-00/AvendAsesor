import type { RetrievedChunk } from './retrieval.gateway';
import type { ChatContextMessage } from '../chat/chat-history.gateway';

export interface AnswerGatewayInput {
  abortSignal?: AbortSignal;
  conversationContext: ChatContextMessage[];
  question: string;
  sources: RetrievedChunk[];
}

export interface AnswerGateway {
  generate(input: AnswerGatewayInput): AsyncIterable<string>;
}
