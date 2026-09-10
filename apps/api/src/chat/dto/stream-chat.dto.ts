import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { trimText } from '../../modules/dto/module.dto-helpers';

export class StreamChatDto {
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @IsUUID()
  moduleId?: string;

  @IsString()
  @Length(1, 8_000)
  @trimText
  question!: string;
}
