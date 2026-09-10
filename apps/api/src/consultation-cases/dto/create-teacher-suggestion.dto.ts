import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTeacherSuggestionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  comment!: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsUUID()
  submissionId!: string;
}
