import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { trimText } from '../../modules/dto/module.dto-helpers';
import type { AccountStatus, UserRole } from '../../users/domain/user-profile';

export class UpdateAdministrativeUserDto {
  @IsOptional()
  @IsIn(['active', 'suspended'])
  accountStatus?: AccountStatus;

  @IsString()
  @Length(4, 500)
  @trimText
  reason!: string;

  @IsOptional()
  @IsIn(['superadmin', 'admin', 'docente'])
  role?: UserRole;
}
