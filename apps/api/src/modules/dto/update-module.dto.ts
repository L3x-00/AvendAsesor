import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from 'class-validator';
import type { ModuleMetadata } from '../domain/module';
import { trimText, uppercaseCode } from './module.dto-helpers';

export class UpdateModuleDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9_]{1,63}$/)
  @uppercaseCode
  code?: string;

  @IsOptional()
  @IsString()
  @Length(2, 500)
  @trimText
  description?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: ModuleMetadata;

  @IsOptional()
  @IsString()
  @Length(2, 255)
  @trimText
  name?: string;

  @IsOptional()
  @IsUUID('4')
  parentModuleId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
