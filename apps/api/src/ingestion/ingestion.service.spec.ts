/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import type {
  ClaimedIngestionJob,
  IngestionGateway,
} from './ingestion.gateway';

const job: ClaimedIngestionJob = {
  attemptCount: 1,
  documentId: 'document-id',
  documentVersionId: 'version-id',
  jobId: 'job-id',
  leaseToken: 'lease-token',
  pageCount: 1,
  sha256: 'a'.repeat(64),
  storageBucket: 'normative-documents',
  storagePath: 'documents/document-id/versions/version-id.pdf',
};

const chunk = {
  chunkContent: 'Texto normativo suficiente para una prueba.',
  chunkIndex: 0,
  pageEnd: 1,
  pageStart: 1,
  tokenCount: 8,
};

function vector(): number[] {
  return Array.from({ length: 1536 }, () => 0.01);
}

function createGateway(): jest.Mocked<IngestionGateway> {
  return {
    claimNext: jest.fn(),
    clearChunks: jest.fn(),
    complete: jest.fn(),
    downloadPdf: jest.fn(),
    fail: jest.fn(),
    insertChunks: jest.fn(),
    refreshLease: jest.fn(),
  };
}

describe('IngestionService', () => {
  let gateway: jest.Mocked<IngestionGateway>;
  let embeddings: { embed: jest.Mock };
  let pdf: { extract: jest.Mock; render: jest.Mock };
  let ocr: { recognize: jest.Mock };
  let chunking: { chunk: jest.Mock };
  let service: IngestionService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    gateway = createGateway();
    embeddings = { embed: jest.fn() };
    pdf = { extract: jest.fn(), render: jest.fn() };
    ocr = { recognize: jest.fn() };
    chunking = { chunk: jest.fn() };
    service = new IngestionService(
      gateway,
      embeddings,
      pdf,
      ocr,
      chunking as never,
      { get: jest.fn().mockReturnValue(300) } as never,
    );
  });

  it('does nothing when no durable job is available', async () => {
    gateway.claimNext.mockResolvedValue(null);

    await expect(service.processNext()).resolves.toBe(false);
    expect(gateway.downloadPdf).not.toHaveBeenCalled();
  });

  it('uses the safe lease default when configuration does not provide one', async () => {
    const defaultGateway = createGateway();
    defaultGateway.claimNext.mockResolvedValue(null);
    const defaultService = new IngestionService(
      defaultGateway,
      embeddings,
      pdf,
      ocr,
      chunking as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
    );

    await expect(defaultService.processNext()).resolves.toBe(false);
    expect(defaultGateway.claimNext).toHaveBeenCalledWith(300);
  });

  it('ingests extracted PDF text, stores vectors and completes the leased job', async () => {
    gateway.claimNext.mockResolvedValue(job);
    gateway.downloadPdf.mockResolvedValue(Buffer.from('%PDF'));
    pdf.extract.mockResolvedValue([
      {
        pageNumber: 1,
        text: 'Texto suficiente para superar el umbral de OCR local. '.repeat(
          2,
        ),
      },
    ]);
    chunking.chunk.mockReturnValue([chunk]);
    embeddings.embed.mockResolvedValue([vector()]);

    await expect(service.processNext()).resolves.toBe(true);

    expect(pdf.render).not.toHaveBeenCalled();
    expect(gateway.clearChunks).toHaveBeenCalledWith(job);
    const insertedChunk = gateway.insertChunks.mock.calls[0][0][0];
    expect(insertedChunk.documentId).toBe(job.documentId);
    expect(insertedChunk.documentVersionId).toBe(job.documentVersionId);
    expect(insertedChunk.embedding).toHaveLength(1536);
    expect(gateway.refreshLease).toHaveBeenCalledWith(job, 300);
    expect(gateway.complete).toHaveBeenCalledWith(job);
  });

  it('uses local OCR only for sparse pages before chunking', async () => {
    gateway.claimNext.mockResolvedValue(job);
    gateway.downloadPdf.mockResolvedValue(Buffer.from('%PDF'));
    pdf.extract.mockResolvedValue([{ pageNumber: 1, text: '  ' }]);
    pdf.render.mockResolvedValue(new Map([[1, Buffer.from('image')]]));
    ocr.recognize.mockResolvedValue('Texto recuperado por OCR');
    chunking.chunk.mockReturnValue([chunk]);
    embeddings.embed.mockResolvedValue([vector()]);

    await expect(service.processNext()).resolves.toBe(true);

    expect(pdf.render).toHaveBeenCalledWith(expect.any(Buffer), [1]);
    expect(ocr.recognize).toHaveBeenCalledWith(Buffer.from('image'));
    expect(chunking.chunk).toHaveBeenCalledWith([
      { pageNumber: 1, text: 'Texto recuperado por OCR' },
    ]);
  });

  it('keeps a sparse page unchanged when local rendering does not return it', async () => {
    gateway.claimNext.mockResolvedValue(job);
    gateway.downloadPdf.mockResolvedValue(Buffer.from('%PDF'));
    pdf.extract.mockResolvedValue([{ pageNumber: 1, text: '  ' }]);
    pdf.render.mockResolvedValue(new Map());
    chunking.chunk.mockReturnValue([chunk]);
    embeddings.embed.mockResolvedValue([vector()]);

    await expect(service.processNext()).resolves.toBe(true);
    expect(ocr.recognize).not.toHaveBeenCalled();
  });

  it('records empty parsed content as a retryable failure', async () => {
    gateway.claimNext.mockResolvedValue(job);
    gateway.downloadPdf.mockResolvedValue(Buffer.from('%PDF'));
    pdf.extract.mockResolvedValue([
      {
        pageNumber: 1,
        text: 'Texto suficiente para superar el umbral de OCR local. '.repeat(
          2,
        ),
      },
    ]);
    chunking.chunk.mockReturnValue([]);

    await expect(service.processNext()).resolves.toBe(false);
    expect(gateway.fail).toHaveBeenCalledWith(
      job,
      'INGESTION_FAILED',
      'INGESTION_EMPTY_TEXT',
      true,
    );
  });

  it('batches persistence and renews its lease while ingesting a long document', async () => {
    const chunks = Array.from({ length: 26 }, (_, chunkIndex) => ({
      ...chunk,
      chunkIndex,
    }));
    gateway.claimNext.mockResolvedValue(job);
    gateway.downloadPdf.mockResolvedValue(Buffer.from('%PDF'));
    pdf.extract.mockResolvedValue([
      {
        pageNumber: 1,
        text: 'Texto suficiente para superar el umbral de OCR local. '.repeat(
          2,
        ),
      },
    ]);
    chunking.chunk.mockReturnValue(chunks);
    embeddings.embed.mockResolvedValue(chunks.map(() => vector()));

    await expect(service.processNext()).resolves.toBe(true);

    expect(gateway.insertChunks).toHaveBeenCalledTimes(2);
    expect(gateway.refreshLease).toHaveBeenCalledTimes(2);
  });

  it('marks the job as retryable when extraction or vectors are invalid', async () => {
    gateway.claimNext.mockResolvedValue(job);
    gateway.downloadPdf.mockResolvedValue(Buffer.from('%PDF'));
    pdf.extract.mockResolvedValue([
      {
        pageNumber: 1,
        text: 'Texto suficiente para superar el umbral de OCR local. '.repeat(
          2,
        ),
      },
    ]);
    chunking.chunk.mockReturnValue([chunk]);
    embeddings.embed.mockResolvedValue([[0.01]]);

    await expect(service.processNext()).resolves.toBe(false);

    expect(gateway.complete).not.toHaveBeenCalled();
    expect(gateway.fail).toHaveBeenCalledWith(
      job,
      'INGESTION_FAILED',
      'INGESTION_INVALID_EMBEDDING',
      true,
    );
  });

  it('contains persistence failures while recording the original ingestion failure', async () => {
    gateway.claimNext.mockResolvedValue(job);
    gateway.downloadPdf.mockRejectedValue(new Error('storage offline'));
    gateway.fail.mockRejectedValue(new Error('database offline'));

    await expect(service.processNext()).resolves.toBe(false);
    expect(gateway.fail).toHaveBeenCalledWith(
      job,
      'INGESTION_FAILED',
      'storage offline',
      true,
    );
  });
});
