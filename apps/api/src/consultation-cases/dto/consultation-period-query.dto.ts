import { IsEnum, IsOptional } from 'class-validator';
import type { ConsultationPeriod } from '../consultation-cases.gateway';

const periods: ConsultationPeriod[] = [
  'today',
  'week',
  'month',
  'last_6h',
  'last_24h',
  'last_7d',
  'last_30d',
];

export class ConsultationPeriodQueryDto {
  @IsOptional()
  @IsEnum(periods)
  period?: ConsultationPeriod;
}
