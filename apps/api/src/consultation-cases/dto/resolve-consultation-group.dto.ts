import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
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

/** Cierra de una vez los casos de un grupo de consultas sin sustento. */
export class ResolveConsultationGroupDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  caseIds!: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  note!: string;

  @IsIn(['resolved', 'discarded'])
  status!: 'discarded' | 'resolved';

  /** Periodo en que se armó el grupo (el mismo de la pantalla). */
  @IsOptional()
  @IsIn(periods)
  period?: ConsultationPeriod;
}
