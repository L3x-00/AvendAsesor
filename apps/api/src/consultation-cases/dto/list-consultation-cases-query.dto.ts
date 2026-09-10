import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  ConsultationCaseIssue,
  ConsultationCaseKind,
  ConsultationCaseStatus,
  ConsultationPeriod,
} from '../consultation-cases.gateway';

const periods: ConsultationPeriod[] = ['today', 'week', 'month'];
const statuses: ConsultationCaseStatus[] = [
  'pending',
  'in_review',
  'resolved',
  'discarded',
];
const kinds: ConsultationCaseKind[] = [
  'automatic_alert',
  'teacher_report',
  'teacher_suggestion',
];
const issues: ConsultationCaseIssue[] = [
  'support_insufficient',
  'support_partial',
  'stale_document',
  'citation_insufficient',
  'possible_contradiction',
  'low_confidence',
  'technical_error',
  'ambiguous_request',
  'teacher_report',
  'teacher_suggestion',
];

export class ListConsultationCasesQueryDto {
  @IsOptional()
  @IsEnum(issues)
  issueType?: ConsultationCaseIssue;

  @IsOptional()
  @IsEnum(kinds)
  kind?: ConsultationCaseKind;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsUUID()
  moduleId?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsEnum(periods)
  period?: ConsultationPeriod;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  query?: string;

  @IsOptional()
  @IsEnum(statuses)
  status?: ConsultationCaseStatus;

  @IsOptional()
  @IsUUID()
  submoduleId?: string;
}
