import type { DocumentSituation } from '../documents/domain/document';

export type RetrievalScope = 'archived_explicit' | 'current' | 'historical';

export interface RetrievedChunk {
  articleReference: string | null;
  chunkContent: string;
  chunkId: string;
  documentId: string;
  documentSituation: DocumentSituation;
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
    retrievalScope: RetrievalScope;
    selectedModuleId: string | null;
  }): Promise<RetrievedChunk[]>;
}
