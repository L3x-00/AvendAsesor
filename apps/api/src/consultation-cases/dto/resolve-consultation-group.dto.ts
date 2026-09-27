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
  @IsIn(['today', 'week', 'month'])
  period?: 'month' | 'today' | 'week';
}
