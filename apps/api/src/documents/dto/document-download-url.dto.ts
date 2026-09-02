import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class DocumentDownloadUrlDto {
  @IsOptional()
  @IsIn(['attachment', 'inline'])
  disposition?: 'attachment' | 'inline';

  @IsOptional()
  @IsUUID('4')
  versionId?: string;
}
