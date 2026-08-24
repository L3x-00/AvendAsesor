import type { RetrievedChunk } from './retrieval.gateway';

export interface AnswerGatewayInput {
  abortSignal?: AbortSignal;
  question: string;
  sources: RetrievedChunk[];
}

export interface AnswerGateway {
  generate(input: AnswerGatewayInput): AsyncIterable<string>;
}
