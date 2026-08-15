import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { trimDocumentText } from './document.dto-helpers';

export class SetDocumentStatusDto {
  @IsBoolean()
  isActive!: boolean;

  @IsOptional()
  @IsString()
  @Length(2, 500)
  @trimDocumentText
  reason?: string;
}
