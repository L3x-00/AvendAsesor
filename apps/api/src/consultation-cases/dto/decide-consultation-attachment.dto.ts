import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const dispositions = ['incorporated', 'not_incorporated'] as const;

export class DecideConsultationAttachmentDto {
  @IsEnum(dispositions)
  disposition!: (typeof dispositions)[number];

  @IsOptional()
  @IsUUID()
  documentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
