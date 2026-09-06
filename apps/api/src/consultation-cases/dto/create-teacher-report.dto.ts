import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type { ConsultationReportReason } from '../consultation-cases.gateway';

const reportReasons: ConsultationReportReason[] = [
  'answer_not_relevant',
  'information_outdated',
  'citation_does_not_support',
  'missing_information',
  'answer_unclear',
  'other',
];

export class CreateTeacherReportDto {
  @IsUUID('4')
  answerMessageId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @IsEnum(reportReasons)
  reason!: ConsultationReportReason;

  @IsUUID('4')
  submissionId!: string;
}
