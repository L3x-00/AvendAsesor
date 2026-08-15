import { IsDefined, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class UpdateModulePositionDto {
  @IsOptional()
  @IsUUID('4')
  parentModuleId?: string | null;

  @IsDefined()
  @IsInt()
  @Min(0)
  sortOrder!: number;
}
