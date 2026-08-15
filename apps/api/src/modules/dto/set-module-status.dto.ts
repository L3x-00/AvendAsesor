import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { trimText } from './module.dto-helpers';

export class SetModuleStatusDto {
  @IsBoolean()
  isActive!: boolean;

  @IsOptional()
  @IsString()
  @Length(2, 500)
  @trimText
  reason?: string;
}
