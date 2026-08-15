import { IsString, Length } from 'class-validator';
import { trimText } from './module.dto-helpers';

export class LogicalDeleteModuleDto {
  @IsString()
  @Length(2, 500)
  @trimText
  reason!: string;
}
