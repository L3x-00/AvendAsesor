import { IsOptional, IsString, Length } from 'class-validator';
import { trimText } from '../../modules/dto/module.dto-helpers';

/**
 * Sets a user's access window. An empty string on either date clears it
 * (indefinite). The exact ISO parsing and start<=expiry rule are enforced in
 * the service and the SECURITY DEFINER RPC.
 */
export class UpdateAccessWindowDto {
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

  @IsString()
  @Length(4, 500)
  @trimText
  reason!: string;
}
