import { IsIn, IsOptional } from 'class-validator';

export type SourceDownloadDisposition = 'attachment' | 'inline';

export class SourceDownloadQueryDto {
  @IsOptional()
  @IsIn(['inline', 'attachment'])
  disposition?: SourceDownloadDisposition;
}
