import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { ModuleActivityFilter } from '../domain/module';

export class ListModulesQueryDto {
  @IsOptional()
  @IsUUID()
  parentModuleId?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: ModuleActivityFilter;
}
