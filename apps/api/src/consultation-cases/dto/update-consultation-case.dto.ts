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

  /**
   * Estado que el revisor tenía en pantalla al decidir. Obligatorio cuando se
   * envía `status`: la RPC no aplica el cambio si el caso ya no está en ese
   * estado, para no sobrescribir una decisión concurrente.
   */
  @IsOptional()
  @IsEnum(statuses)
  expectedStatus?: ConsultationCaseStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsEnum(statuses)
  status?: ConsultationCaseStatus;
}
