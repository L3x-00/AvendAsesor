import { ingestionFailureCause } from './ingestion-failure';

describe('ingestionFailureCause', () => {
  it.each([
    ['LEASE_EXPIRED', 'The ingestion worker lease expired.', 'timeout'],
    ['INGESTION_FAILED', 'INGESTION_EMPTY_TEXT', 'no_text'],
    ['INGESTION_FAILED', 'INGESTION_UNSUPPORTED_FORMAT', 'unsupported_format'],
    ['INGESTION_FAILED', 'INGESTION_DOCUMENT_TOO_LARGE', 'too_large'],
    ['INGESTION_FAILED', 'INGESTION_INVALID_EMBEDDING', 'ai_service'],
    ['INGESTION_FAILED', '429 Rate limit reached for embeddings', 'ai_service'],
    ['INGESTION_FAILED', 'Invalid PDF structure', 'unknown'],
    [null, null, 'unknown'],
  ] as const)('maps %s / %s to %s', (code, message, expected) => {
    expect(ingestionFailureCause(code, message)).toBe(expected);
  });
});
