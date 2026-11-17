import { NotFoundException } from '@nestjs/common';
import { DocumentRelationsController } from './document-relations.controller';
import { isDocumentRelationsQuestion } from './document-relation-intent';
import type {
  DocumentRelationsGateway,
  RelatedDocumentRow,
} from './document-relations.gateway';
import { DocumentRelationsService } from './document-relations.service';

const documentId = '11111111-1111-1111-1111-111111111111';
const relatedId = '22222222-2222-2222-2222-222222222222';

const sourceRow: RelatedDocumentRow = {
  sourceDocumentId: documentId,
  sourceTitle: 'Ley de Reforma Magisterial',
  sourceType: 'LEY',
  sourceYear: 2012,
  relationId: null,
  relationType: null,
  notes: null,
  targetDocumentId: null,
  targetTitle: null,
  targetType: null,
  targetYear: null,
  evidenceChunkId: null,
};

const relationRow: RelatedDocumentRow = {
  ...sourceRow,
  relationId: '33333333-3333-3333-3333-333333333333',
  relationType: 'reglamenta',
  notes: 'Reglamento de la Ley de Reforma Magisterial',
  targetDocumentId: relatedId,
  targetTitle: 'Decreto Supremo 004-2013-ED',
  targetType: 'DECRETO_SUPREMO',
  targetYear: 2013,
  evidenceChunkId: '44444444-4444-4444-4444-444444444444',
};

function build(rows: RelatedDocumentRow[]): DocumentRelationsService {
  const gateway: DocumentRelationsGateway = {
    relatedDocuments: jest.fn().mockResolvedValue(rows),
  };
  return new DocumentRelationsService(gateway);
}

describe('relaciones entre documentos', () => {
  it('reconoce las frases de la intención desde la configuración', () => {
    expect(isDocumentRelationsQuestion('¿qué normas están relacionadas?')).toBe(
      true,
    );
    expect(isDocumentRelationsQuestion('¿qué modifica esta norma?')).toBe(true);
    expect(isDocumentRelationsQuestion('¿qué deroga el decreto?')).toBe(true);
    expect(isDocumentRelationsQuestion('¿qué reglamenta la ley?')).toBe(true);
    expect(
      isDocumentRelationsQuestion(
        '¿qué normas se relacionan con la Ley 29944?',
      ),
    ).toBe(true);
    expect(
      isDocumentRelationsQuestion(
        '¿qué documentos están vinculados con la resolución?',
      ),
    ).toBe(true);
    expect(
      isDocumentRelationsQuestion('¿qué normas se vinculan con la ley?'),
    ).toBe(true);
    // «Modificar el sueldo» no es una relación documental.
    expect(isDocumentRelationsQuestion('¿qué modifica mi sueldo?')).toBe(false);
    expect(isDocumentRelationsQuestion('¿cuánto gana un docente?')).toBe(false);
  });

  it('devuelve lista vacía con mensaje determinista cuando no hay relaciones', async () => {
    await expect(
      build([sourceRow]).relatedDocuments(documentId),
    ).resolves.toEqual({
      source: {
        id: documentId,
        title: 'Ley de Reforma Magisterial',
        type: 'LEY',
        year: 2012,
      },
      relations: [],
      message: 'No hay relaciones registradas para este documento.',
    });
  });

  it('devuelve las relaciones y cita el documento fuente', async () => {
    await expect(
      build([sourceRow, relationRow]).relatedDocuments(documentId),
    ).resolves.toEqual({
      source: {
        id: documentId,
        title: 'Ley de Reforma Magisterial',
        type: 'LEY',
        year: 2012,
      },
      relations: [
        {
          id: relationRow.relationId,
          type: 'reglamenta',
          notes: 'Reglamento de la Ley de Reforma Magisterial',
          document: {
            id: relatedId,
            title: 'Decreto Supremo 004-2013-ED',
            type: 'DECRETO_SUPREMO',
            year: 2013,
          },
        },
      ],
      message: null,
    });
  });

  it('usa valores seguros cuando el RPC no trae título ni tipo del destino', async () => {
    const incomplete = {
      ...relationRow,
      relationType: null,
      targetTitle: null,
      targetType: null,
      targetYear: null,
    };
    await expect(
      build([sourceRow, incomplete]).relatedDocuments(documentId),
    ).resolves.toMatchObject({
      relations: [
        {
          type: 'cita',
          document: { title: 'Documento sin título', type: 'OTRO', year: null },
        },
      ],
    });
  });

  it('falla cerrado si el documento no existe', async () => {
    await expect(build([]).relatedDocuments(documentId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('la intención se comprueba en la ruta real antes de devolver relaciones', async () => {
    const service = build([sourceRow]);
    await expect(
      service.relatedDocumentsForQuestion(
        '¿qué normas están relacionadas con esta ley?',
        documentId,
      ),
    ).resolves.toMatchObject({
      source: { id: documentId },
      message: 'No hay relaciones registradas para este documento.',
    });
    await expect(
      service.relatedDocumentsForQuestion(
        '¿cuánto gana un docente?',
        documentId,
      ),
    ).rejects.toThrow('La pregunta no solicita relaciones entre documentos.');
  });

  it('el endpoint delega en el servicio por id de documento', async () => {
    const service = build([sourceRow]);
    const controller = new DocumentRelationsController(service);
    await expect(controller.relatedDocuments(documentId)).resolves.toEqual({
      source: {
        id: documentId,
        title: 'Ley de Reforma Magisterial',
        type: 'LEY',
        year: 2012,
      },
      relations: [],
      message: 'No hay relaciones registradas para este documento.',
    });
    await expect(
      controller.relatedDocuments(
        documentId,
        '¿qué normas están relacionadas con esta ley?',
      ),
    ).resolves.toMatchObject({ source: { id: documentId } });
    await expect(
      controller.relatedDocuments(documentId, '¿cuánto gana un docente?'),
    ).rejects.toThrow('La pregunta no solicita relaciones entre documentos.');
  });
});
