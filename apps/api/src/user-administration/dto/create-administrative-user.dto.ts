import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { trimText } from '../../modules/dto/module.dto-helpers';
import type { UserRole } from '../../users/domain/user-profile';

/**
 * Registers a user or an administrator. The email is the login: there is no
 * separate username and no PIN (ADR-0017). Optional text fields accept an empty
 * string because a cleared form field arrives as "", not as undefined.
 */
export class CreateAdministrativeUserDto {
  @IsString()
  @Length(2, 160)
  @trimText
  fullName!: string;

  @IsEmail()
  @Length(5, 254)
  @trimText
  email!: string;

  @IsOptional()
  @IsString()
  @Length(0, 20)
  @trimText
  phone?: string;

  @IsOptional()
  @IsIn(['superadmin', 'admin', 'docente'])
  role?: UserRole;

  @IsOptional()
  @IsString()
  @Length(0, 40)
  @trimText
  accessStartAt?: string;

  @IsOptional()
  @IsString()
  @Length(0, 40)
  @trimText
  accessExpiresAt?: string;
}
