export interface EmbeddingsGateway {
  embed(inputs: string[]): Promise<number[][]>;
}
