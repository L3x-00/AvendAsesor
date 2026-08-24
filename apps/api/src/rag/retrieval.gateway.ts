export interface RetrievedChunk {
  articleReference: string | null;
  chunkContent: string;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentVersionId: string;
  lexicalScore: number;
  moduleIds: string[];
  moduleNames: string[];
  numeralReference: string | null;
  pageEnd: number;
  pageStart: number;
  sectionTitle: string | null;
  semanticScore: number;
  versionNumber: number;
}

export interface RetrievalGateway {
  search(input: {
    embedding: number[];
    matchCount: number;
    matchThreshold: number;
    query: string;
    selectedModuleId: string | null;
  }): Promise<RetrievedChunk[]>;
}
