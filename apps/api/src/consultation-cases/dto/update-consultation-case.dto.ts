import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type { ConsultationCaseStatus } from '../consultation-cases.gateway';

const statuses: ConsultationCaseStatus[] = [
  'pending',
  'in_review',
  'resolved',
  'discarded',
];

export class UpdateConsultationCaseDto {
  @IsOptional()
  @IsBoolean()
  changeRouting?: boolean;

  @IsOptional()
  @IsUUID()
  detectedModuleId?: string | null;

  @IsOptional()
  @IsUUID()
  detectedSubmoduleId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsEnum(statuses)
  status?: ConsultationCaseStatus;
}
