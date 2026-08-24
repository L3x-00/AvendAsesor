import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { trimText } from '../../modules/dto/module.dto-helpers';

export class ListAdministrativeUsersQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  @trimText
  search?: string;
}
