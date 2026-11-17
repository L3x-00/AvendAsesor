import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SUPABASE_DOCUMENT_RELATIONS_GATEWAY } from '../supabase/supabase.constants';
import { isDocumentRelationsQuestion } from './document-relation-intent';
import type { DocumentRelationsGateway } from './document-relations.gateway';

export interface RelatedDocumentSummary {
  id: string;
  title: string;
  type: string;
  year: number | null;
}

export interface DocumentRelationResponse {
  source: RelatedDocumentSummary;
  relations: Array<{
    id: string;
    type: string;
    notes: string | null;
    document: RelatedDocumentSummary;
  }>;
  /** Mensaje determinista cuando no hay relaciones registradas. */
  message: string | null;
}

@Injectable()
export class DocumentRelationsService {
  constructor(
    @Inject(SUPABASE_DOCUMENT_RELATIONS_GATEWAY)
    private readonly gateway: DocumentRelationsGateway,
  ) {}

  /**
   * La intención declarativa se comprueba en la ruta real: una pregunta que no
   * pide relaciones documentales no se responde con esta lista, aunque traiga
   * un id de documento. Resolver «Ley 29944» a un id no es responsabilidad de
   * esta capa: si el documento no está identificado, no se adivina.
   */
  async relatedDocumentsForQuestion(
    question: string,
    documentId: string,
  ): Promise<DocumentRelationResponse> {
    if (!isDocumentRelationsQuestion(question)) {
      throw new BadRequestException(
        'La pregunta no solicita relaciones entre documentos.',
      );
    }
    return this.relatedDocuments(documentId);
  }

  async relatedDocuments(
    documentId: string,
  ): Promise<DocumentRelationResponse> {
    const rows = await this.gateway.relatedDocuments(documentId);
    const source = rows[0];
    if (!source) throw new NotFoundException('Documento no encontrado.');
    const relations = rows
      .filter((row) => row.relationId && row.targetDocumentId)
      .map((row) => ({
        id: row.relationId!,
        type: row.relationType ?? 'cita',
        notes: row.notes,
        // El id del chunk de sustento no se entrega: la FK solo prueba que el
        // chunk existe, no que pertenezca a estos documentos.
        document: {
          id: row.targetDocumentId!,
          title: row.targetTitle ?? 'Documento sin título',
          type: row.targetType ?? 'OTRO',
          year: row.targetYear,
        },
      }));
    return {
      source: {
        id: source.sourceDocumentId,
        title: source.sourceTitle,
        type: source.sourceType,
        year: source.sourceYear,
      },
      relations,
      message: relations.length
        ? null
        : 'No hay relaciones registradas para este documento.',
    };
  }
}
