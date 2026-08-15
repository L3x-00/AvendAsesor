import {
  IsInt,
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
  parseJsonObject,
  trimDocumentText,
  uppercaseDocumentType,
} from './document.dto-helpers';

export class UpdateDocumentMetadataDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  @trimDocumentText
  articleReference?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9_]{1,63}$/)
  @uppercaseDocumentType
  documentType?: string;

  @IsOptional()
  @IsInt()
  @Min(1800)
  @Max(2200)
  @Type(() => Number)
  issuanceYear?: number | null;

  @IsOptional()
  @IsString()
  @Length(2, 255)
  @trimDocumentText
  issuingEntity?: string | null;

  @IsOptional()
  @IsObject()
  @parseJsonObject
  metadata?: DocumentMetadata;

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
