import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { DocumentMetadata } from '../domain/document';
import {
  parseJsonArray,
  parseJsonObject,
  trimDocumentText,
  uppercaseDocumentType,
} from './document.dto-helpers';

export class CreateDocumentUploadDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  @trimDocumentText
  articleReference?: string;

  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9_]{1,63}$/)
  @uppercaseDocumentType
  documentType!: string;

  @IsOptional()
  @IsInt()
  @Min(1800)
  @Max(2200)
  @Type(() => Number)
  issuanceYear?: number;

  @IsOptional()
  @IsString()
  @Length(2, 255)
  @trimDocumentText
  issuingEntity?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  @parseJsonArray
  moduleIds?: string[];

  @IsOptional()
  @IsObject()
  @parseJsonObject
  metadata?: DocumentMetadata;

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
