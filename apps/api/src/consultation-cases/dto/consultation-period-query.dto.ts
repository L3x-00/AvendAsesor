import { IsEnum, IsOptional } from 'class-validator';
import type { ConsultationPeriod } from '../consultation-cases.gateway';

const periods: ConsultationPeriod[] = ['today', 'week', 'month'];

export class ConsultationPeriodQueryDto {
  @IsOptional()
  @IsEnum(periods)
  period?: ConsultationPeriod;
}
