import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import type { ModuleMetadata } from '../domain/module';
import { trimText, uppercaseCode } from './module.dto-helpers';

export class CreateModuleDto {
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9_]{1,63}$/)
  @uppercaseCode
  code!: string;

  @IsOptional()
  @IsString()
  @Length(2, 500)
  @trimText
  description?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: ModuleMetadata;

  @IsString()
  @Length(2, 255)
  @trimText
  name!: string;

  @IsOptional()
  @IsUUID()
  parentModuleId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
