import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AuthorizationGuard,
  CurrentAuthorization,
  RequireRoles,
  RolesGuard,
  type AuthorizationContext,
} from '../authorization';
import { CreateModuleDto } from './dto/create-module.dto';
import { ListModulesQueryDto } from './dto/list-modules-query.dto';
import { LogicalDeleteModuleDto } from './dto/logical-delete-module.dto';
import { SetModuleStatusDto } from './dto/set-module-status.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import { UpdateModulePositionDto } from './dto/update-module-position.dto';
import type { ManagedModule } from './domain/module';
import { ModulesService } from './modules.service';

@Controller('admin/modules')
@UseGuards(ThrottlerGuard, AuthorizationGuard, RolesGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@RequireRoles('admin', 'superadmin')
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateModuleDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<ManagedModule> {
    return this.modulesService.create(dto, authorization);
  }

  @Get()
  list(@Query() dto: ListModulesQueryDto): Promise<ManagedModule[]> {
    return this.modulesService.list(dto);
  }

  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) moduleId: string,
  ): Promise<ManagedModule> {
    return this.modulesService.findOne(moduleId);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) moduleId: string,
    @Body() dto: SetModuleStatusDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<ManagedModule> {
    return this.modulesService.setStatus(moduleId, dto, authorization);
  }

  @Patch(':id/position')
  setPosition(
    @Param('id', new ParseUUIDPipe({ version: '4' })) moduleId: string,
    @Body() dto: UpdateModulePositionDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<ManagedModule> {
    return this.modulesService.update(moduleId, dto, authorization);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) moduleId: string,
    @Body() dto: UpdateModuleDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<ManagedModule> {
    return this.modulesService.update(moduleId, dto, authorization);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logicalDelete(
    @Param('id', new ParseUUIDPipe({ version: '4' })) moduleId: string,
    @Body() dto: LogicalDeleteModuleDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<void> {
    await this.modulesService.logicalDelete(moduleId, dto, authorization);
  }
}
