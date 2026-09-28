import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class AddDocumentVersionDto {
  /** Año del documento para esta versión nueva. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  issuanceYear?: number;

  /** `replaces` sustituye a la versión anterior; `complements` la completa. */
  @IsOptional()
  @IsIn(['replaces', 'complements'])
  versionRelation?: 'complements' | 'replaces';
}
