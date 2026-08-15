import { IsString, Length } from 'class-validator';
import { trimDocumentText } from './document.dto-helpers';

export class LogicalDeleteDocumentDto {
  @IsString()
  @Length(2, 500)
  @trimDocumentText
  reason!: string;
}
