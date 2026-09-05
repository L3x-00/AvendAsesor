import { IsBoolean, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class SetModulePermissionDto {
  @IsBoolean()
  canAccess!: boolean;

  @IsString()
  @Length(4, 500)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  reason!: string;
}
