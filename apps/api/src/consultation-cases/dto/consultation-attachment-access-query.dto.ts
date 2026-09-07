import { IsEnum, IsOptional } from 'class-validator';

const accessModes = ['view', 'download'] as const;

export class ConsultationAttachmentAccessQueryDto {
  @IsOptional()
  @IsEnum(accessModes)
  mode?: (typeof accessModes)[number];
}
