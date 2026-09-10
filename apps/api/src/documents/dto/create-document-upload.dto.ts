import {
  ArrayUnique,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  ARCHIVE_REASON_CODES,
  currentDocumentYear,
  DOCUMENT_TYPE_CODES,
  ISSUING_ENTITY_CODES,
  type ArchiveReasonCode,
  type DocumentTypeCode,
  type IssuingEntityCode,
} from '../document-governance.constants';
import type { DocumentMetadata, DocumentSituation } from '../domain/document';
import {
  parseJsonArray,
  parseJsonObject,
  trimDocumentText,
  uppercaseDocumentType,
} from './document.dto-helpers';

export class CreateDocumentUploadDto {
  @IsOptional()
  @IsIn(ARCHIVE_REASON_CODES)
  archiveReasonCode?: ArchiveReasonCode;

  @IsOptional()
  @IsString()
  @Length(2, 500)
  @trimDocumentText
  archiveReasonDetail?: string;

  @IsOptional()
  @IsString()
  @Length(2, 500)
  @trimDocumentText
  additionalDetail?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  @trimDocumentText
  articleReference?: string;

  /** Palabras clave libres del administrador; alimentan el buscador. */
  @IsOptional()
  @IsString()
  @Length(2, 500)
  @trimDocumentText
  keywords?: string;

  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9_]{1,63}$/)
  @IsIn(DOCUMENT_TYPE_CODES)
  @uppercaseDocumentType
  documentType!: DocumentTypeCode;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  @trimDocumentText
  documentTypeOther?: string;

  @IsInt()
  @Min(1800)
  @Max(currentDocumentYear())
  @Type(() => Number)
  issuanceYear!: number;

  @IsString()
  @IsIn(ISSUING_ENTITY_CODES)
  @uppercaseDocumentType
  issuingEntity!: IssuingEntityCode;

  @IsOptional()
  @IsString()
  @Length(2, 255)
  @trimDocumentText
  issuingEntityOther?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  @parseJsonArray
  moduleIds!: string[];

  @IsOptional()
  @IsObject()
  @parseJsonObject
  metadata?: DocumentMetadata;

  @IsOptional()
  @IsString()
  @Length(2, 1000)
  @trimDocumentText
  observation?: string;

  @IsOptional()
  @IsString()
  @Length(2, 500)
  @trimDocumentText
  reason?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim().length === 0 ? undefined : value,
  )
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  replacementDate?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim().length === 0 ? undefined : value,
  )
  @IsUUID()
  replacementDocumentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1800)
  @Max(currentDocumentYear())
  replacementYear?: number;

  @IsOptional()
  @IsIn(['archived', 'current', 'replaced'])
  situation: DocumentSituation = 'current';

  @IsString()
  @Length(2, 255)
  @trimDocumentText
  specificDependency!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  @trimDocumentText
  resolutionNumber?: string;

  @IsString()
  @Length(2, 500)
  @trimDocumentText
  title!: string;
}
