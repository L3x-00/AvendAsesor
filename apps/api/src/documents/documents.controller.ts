import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AuthorizationGuard,
  CurrentAuthorization,
  FeaturesGuard,
  RequireFeatures,
  RequireRoles,
  RolesGuard,
  type AuthorizationContext,
} from '../authorization';
import { CreateDocumentUploadDto } from './dto/create-document-upload.dto';
import { DocumentDownloadUrlDto } from './dto/document-download-url.dto';
import { DocumentModuleDto } from './dto/document-module.dto';
import { ListDocumentLibraryQueryDto } from './dto/list-document-library-query.dto';
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto';
import { LogicalDeleteDocumentDto } from './dto/logical-delete-document.dto';
import { SetDocumentStatusDto } from './dto/set-document-status.dto';
import { SetDocumentSituationDto } from './dto/set-document-situation.dto';
import { SetDocumentTechnicalStatusDto } from './dto/set-document-technical-status.dto';
import { UpdateDocumentMetadataDto } from './dto/update-document-metadata.dto';
import type {
  ManagedDocument,
  ManagedDocumentDetails,
  DocumentLibraryPage,
} from './domain/document';
import { DocumentsService } from './documents.service';
import { MulterExceptionFilter } from './multer-exception.filter';
import { MAX_PDF_BYTES } from './pdf-inspection.service';

@Controller('admin/documents')
@UseGuards(ThrottlerGuard, AuthorizationGuard, RolesGuard, FeaturesGuard)
@UseFilters(MulterExceptionFilter)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@RequireRoles('admin', 'superadmin')
@RequireFeatures('modules')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_PDF_BYTES, files: 1 },
    }),
  )
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(
    @Body() dto: CreateDocumentUploadDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<ManagedDocument> {
    return this.documentsService.create(dto, file, authorization);
  }

  @Get()
  list(@Query() dto: ListDocumentsQueryDto): Promise<ManagedDocument[]> {
    return this.documentsService.list(dto);
  }

  @Get('library')
  listLibrary(
    @Query() dto: ListDocumentLibraryQueryDto,
  ): Promise<DocumentLibraryPage> {
    return this.documentsService.listLibrary(dto);
  }

  @Get('suggestions')
  listSuggestions(): Promise<{
    additionalDetails: string[];
    specificDependencies: string[];
  }> {
    return this.documentsService.listSuggestions();
  }

  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) documentId: string,
  ): Promise<ManagedDocumentDetails> {
    return this.documentsService.findOne(documentId);
  }

  @Post(':id/versions')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_PDF_BYTES, files: 1 },
    }),
  )
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  addVersion(
    @Param('id', new ParseUUIDPipe({ version: '4' })) documentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<ManagedDocument> {
    return this.documentsService.addVersion(documentId, file, authorization);
  }

  @Post(':id/download-url')
  createDownloadUrl(
    @Param('id', new ParseUUIDPipe({ version: '4' })) documentId: string,
    @Body() dto: DocumentDownloadUrlDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<{ expiresAt: string; url: string; versionId: string }> {
    return this.documentsService.createDownloadUrl(
      documentId,
      dto,
      authorization,
    );
  }

  @Post(':id/modules')
  @HttpCode(HttpStatus.NO_CONTENT)
  async linkModule(
    @Param('id', new ParseUUIDPipe({ version: '4' })) documentId: string,
    @Body() dto: DocumentModuleDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<void> {
    await this.documentsService.linkModule(documentId, dto, authorization);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) documentId: string,
    @Body() dto: SetDocumentStatusDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<ManagedDocument> {
    return this.documentsService.setStatus(documentId, dto, authorization);
  }

  @Patch(':id/situation')
  setSituation(
    @Param('id', new ParseUUIDPipe({ version: '4' })) documentId: string,
    @Body() dto: SetDocumentSituationDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<ManagedDocument> {
    return this.documentsService.setSituation(documentId, dto, authorization);
  }

  @Patch(':id/technical-status')
  setTechnicalStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) documentId: string,
    @Body() dto: SetDocumentTechnicalStatusDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<ManagedDocument> {
    return this.documentsService.setTechnicalStatus(
      documentId,
      dto,
      authorization,
    );
  }

  @Patch(':id')
  updateMetadata(
    @Param('id', new ParseUUIDPipe({ version: '4' })) documentId: string,
    @Body() dto: UpdateDocumentMetadataDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<ManagedDocument> {
    return this.documentsService.updateMetadata(documentId, dto, authorization);
  }

  @Delete(':id/modules/:moduleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlinkModule(
    @Param('id', new ParseUUIDPipe({ version: '4' })) documentId: string,
    @Param('moduleId', new ParseUUIDPipe({ version: '4' })) moduleId: string,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<void> {
    await this.documentsService.unlinkModule(
      documentId,
      moduleId,
      authorization,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logicalDelete(
    @Param('id', new ParseUUIDPipe({ version: '4' })) documentId: string,
    @Body() dto: LogicalDeleteDocumentDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<void> {
    await this.documentsService.logicalDelete(documentId, dto, authorization);
  }
}
