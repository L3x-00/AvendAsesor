import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { ModuleActivityFilter } from '../domain/module';

export class ListModulesQueryDto {
  @IsOptional()
  @IsUUID('4')
  parentModuleId?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: ModuleActivityFilter;
}
