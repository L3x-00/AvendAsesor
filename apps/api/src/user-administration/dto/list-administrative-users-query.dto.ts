import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { trimText } from '../../modules/dto/module.dto-helpers';
import type {
  AdministrativeUserGroup,
  AdministrativeUserStatusFilter,
} from '../user-administration.gateway';

export class ListAdministrativeUsersQueryDto {
  @IsOptional()
  @IsIn(['docente', 'staff'])
  group?: AdministrativeUserGroup;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  offset?: number;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  @trimText
  search?: string;

  @IsOptional()
  @IsIn(['active', 'suspended'])
  status?: AdministrativeUserStatusFilter;
}
