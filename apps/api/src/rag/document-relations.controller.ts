import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthorizationGuard, RequireRoles, RolesGuard } from '../authorization';
import { DocumentRelationsService } from './document-relations.service';

@Controller('rag')
@UseGuards(ThrottlerGuard, AuthorizationGuard, RolesGuard)
@RequireRoles('docente', 'admin', 'superadmin')
export class DocumentRelationsController {
  constructor(private readonly service: DocumentRelationsService) {}

  /**
   * Relaciones declaradas de un documento, con su identidad verificable.
   * Es una lectura global del catálogo: no hay ACL por módulo en esta ruta,
   * pero el RPC solo devuelve documentos activos y no eliminados.
   */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('related-documents/:documentId')
  relatedDocuments(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Query('question') question?: string,
  ) {
    return question
      ? this.service.relatedDocumentsForQuestion(question, documentId)
      : this.service.relatedDocuments(documentId);
  }
}
