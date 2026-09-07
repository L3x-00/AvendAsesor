import {
  IsInt,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { DocumentMetadata } from '../domain/document';
import {
  currentDocumentYear,
  DOCUMENT_TYPE_CODES,
  ISSUING_ENTITY_CODES,
  type DocumentTypeCode,
  type IssuingEntityCode,
} from '../document-governance.constants';
import {
  parseJsonObject,
  trimDocumentText,
  uppercaseDocumentType,
} from './document.dto-helpers';

export class UpdateDocumentMetadataDto {
  @IsOptional()
  @IsString()
  @Length(2, 500)
  @trimDocumentText
  additionalDetail?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  @trimDocumentText
  articleReference?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9_]{1,63}$/)
  @IsIn(DOCUMENT_TYPE_CODES)
  @uppercaseDocumentType
  documentType?: DocumentTypeCode;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  @trimDocumentText
  documentTypeOther?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1800)
  @Max(currentDocumentYear())
  @Type(() => Number)
  issuanceYear?: number | null;

  @IsOptional()
  @IsString()
  @IsIn(ISSUING_ENTITY_CODES)
  @uppercaseDocumentType
  issuingEntity?: IssuingEntityCode | null;

  @IsOptional()
  @IsString()
  @Length(2, 255)
  @trimDocumentText
  issuingEntityOther?: string | null;

  /** Palabras clave libres del administrador; alimentan el buscador. */
  @IsOptional()
  @IsString()
  @Length(2, 500)
  @trimDocumentText
  keywords?: string | null;

  @IsOptional()
  @IsObject()
  @parseJsonObject
  metadata?: DocumentMetadata;

  @IsOptional()
  @IsString()
  @Length(2, 255)
  @trimDocumentText
  specificDependency?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  @trimDocumentText
  resolutionNumber?: string | null;

  @IsOptional()
  @IsString()
  @Length(2, 500)
  @trimDocumentText
  title?: string;
}
