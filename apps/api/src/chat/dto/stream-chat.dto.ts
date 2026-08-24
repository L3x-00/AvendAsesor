import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { trimText } from '../../modules/dto/module.dto-helpers';

export class StreamChatDto {
  @IsOptional()
  @IsUUID('4')
  conversationId?: string;

  @IsOptional()
  @IsUUID('4')
  moduleId?: string;

  @IsString()
  @Length(1, 8_000)
  @trimText
  question!: string;
}
