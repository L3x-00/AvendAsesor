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
import type { DocumentSituation } from '../domain/document';
import {
  ARCHIVE_REASON_CODES,
  currentDocumentYear,
  type ArchiveReasonCode,
} from '../document-governance.constants';
import { trimDocumentText } from './document.dto-helpers';

export class SetDocumentSituationDto {
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
  @Length(2, 1000)
  @trimDocumentText
  observation?: string;

  @IsOptional()
  @IsString()
  @Length(2, 500)
  @trimDocumentText
  reason?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim().length === 0 ? undefined : value,
  )
  replacementDate?: string;

  @IsOptional()
  @IsUUID('4')
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim().length === 0 ? undefined : value,
  )
  replacementDocumentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1800)
  @Max(currentDocumentYear())
  replacementYear?: number;

  @IsIn(['archived', 'current', 'replaced'])
  situation!: DocumentSituation;
}
