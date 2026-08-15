import { IsOptional, IsUUID } from 'class-validator';

export class DocumentDownloadUrlDto {
  @IsOptional()
  @IsUUID('4')
  versionId?: string;
}
