import { IsDefined, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class UpdateModulePositionDto {
  @IsOptional()
  @IsUUID()
  parentModuleId?: string | null;

  @IsDefined()
  @IsInt()
  @Min(0)
  sortOrder!: number;
}
