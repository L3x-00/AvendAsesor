import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

/** Módulos concedidos a un administrador; reemplaza el conjunto anterior. */
export class SetModuleGrantsDto {
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  moduleIds!: string[];

  @IsString()
  @Length(4, 500)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  reason!: string;
}
