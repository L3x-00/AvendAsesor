import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import type {
  DocumentLibrarySort,
  DocumentSituation,
  DocumentTechnicalStatus,
} from '../domain/document';

const optionalTrimmedText = Transform(({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
});

export class ListDocumentLibraryQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Za-z][A-Za-z0-9_]{1,63}$/)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim().length > 0
      ? value.trim().toUpperCase()
      : undefined,
  )
  documentType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1800)
  @Max(2200)
  issuanceYear?: number;

  @IsOptional()
  @IsString()
  @Length(2, 255)
  @optionalTrimmedText
  issuingEntity?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsUUID('4')
  moduleId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  @optionalTrimmedText
  q?: string;

  @IsOptional()
  @IsIn(['archived', 'current', 'replaced'])
  situation?: DocumentSituation;

  @IsOptional()
  @IsIn([
    'newest',
    'oldest',
    'year',
    'title',
    'upload_date',
    'document_type',
    'issuing_entity',
    'situation',
    'technical_status',
    'module',
  ])
  sort?: DocumentLibrarySort;

  @IsOptional()
  @IsUUID('4')
  submoduleId?: string;

  @IsOptional()
  @IsIn(['error', 'pending_approval', 'ready'])
  technicalStatus?: DocumentTechnicalStatus;
}
