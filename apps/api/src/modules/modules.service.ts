import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SUPABASE_MODULES_GATEWAY } from '../supabase/supabase.constants';
import type { AuthorizationContext } from '../authorization';
import type { CreateModuleDto } from './dto/create-module.dto';
import type { ListModulesQueryDto } from './dto/list-modules-query.dto';
import type { LogicalDeleteModuleDto } from './dto/logical-delete-module.dto';
import type { SetModuleStatusDto } from './dto/set-module-status.dto';
import type { UpdateModuleDto } from './dto/update-module.dto';
import type { ManagedModule } from './domain/module';
import type { ModulesGateway } from './modules.gateway';

@Injectable()
export class ModulesService {
  constructor(
    @Inject(SUPABASE_MODULES_GATEWAY)
    private readonly modulesGateway: ModulesGateway,
  ) {}

  async create(
    dto: CreateModuleDto,
    authorization: AuthorizationContext,
  ): Promise<ManagedModule> {
    await this.ensureParentIsAvailable(dto.parentModuleId);

    return this.modulesGateway.create({
      code: dto.code,
      createdBy: authorization.userId,
      description: dto.description,
      isActive: dto.isActive,
      metadata: dto.metadata,
      name: dto.name,
      parentModuleId: dto.parentModuleId,
      sortOrder: dto.sortOrder,
      updatedBy: authorization.userId,
    });
  }

  listSummaries(dto: ListModulesQueryDto) {
    return this.modulesGateway.listSummaries({
      status: dto.status ?? 'all',
    });
  }

  async findOne(moduleId: string): Promise<ManagedModule> {
    return this.requireLiveModule(moduleId);
  }

  list(dto: ListModulesQueryDto): Promise<ManagedModule[]> {
    return this.modulesGateway.list({
      parentModuleId: dto.parentModuleId,
      status: dto.status ?? 'all',
    });
  }

  async logicalDelete(
    moduleId: string,
    dto: LogicalDeleteModuleDto,
    authorization: AuthorizationContext,
  ): Promise<void> {
    const module = await this.requireLiveModule(moduleId);

    if (await this.modulesGateway.hasNonDeletedChildren(module.id)) {
      throw new ConflictException(
        'A module with non-deleted children cannot be logically deleted.',
      );
    }

    const now = new Date().toISOString();
    const updated = await this.modulesGateway.update(moduleId, {
      deactivatedAt: now,
      deactivatedBy: authorization.userId,
      deactivationReason: dto.reason,
      deletedAt: now,
      deletedBy: authorization.userId,
      deletionReason: dto.reason,
      isActive: false,
      isDeleted: true,
      updatedBy: authorization.userId,
    });

    if (!updated) {
      throw new NotFoundException('Module was not found.');
    }
  }

  async setStatus(
    moduleId: string,
    dto: SetModuleStatusDto,
    authorization: AuthorizationContext,
  ): Promise<ManagedModule> {
    await this.requireLiveModule(moduleId);

    if (!dto.isActive && !dto.reason) {
      throw new BadRequestException(
        'A deactivation reason is required for an inactive module.',
      );
    }

    const now = new Date().toISOString();
    const updated = await this.modulesGateway.update(moduleId, {
      deactivatedAt: dto.isActive ? null : now,
      deactivatedBy: dto.isActive ? null : authorization.userId,
      deactivationReason: dto.isActive ? null : dto.reason,
      isActive: dto.isActive,
      updatedBy: authorization.userId,
    });

    if (!updated) {
      throw new NotFoundException('Module was not found.');
    }

    return updated;
  }

  async update(
    moduleId: string,
    dto: UpdateModuleDto,
    authorization: AuthorizationContext,
  ): Promise<ManagedModule> {
    const module = await this.requireLiveModule(moduleId);

    if (
      dto.code === undefined &&
      dto.description === undefined &&
      dto.metadata === undefined &&
      dto.name === undefined &&
      dto.parentModuleId === undefined &&
      dto.sortOrder === undefined
    ) {
      throw new BadRequestException('At least one module field is required.');
    }

    if (dto.parentModuleId === module.id) {
      throw new BadRequestException('A module cannot be its own parent.');
    }

    if (dto.parentModuleId !== undefined) {
      await this.ensureParentIsAvailable(dto.parentModuleId);
    }

    const updated = await this.modulesGateway.update(moduleId, {
      code: dto.code,
      description: dto.description,
      metadata: dto.metadata,
      name: dto.name,
      parentModuleId: dto.parentModuleId,
      sortOrder: dto.sortOrder,
      updatedBy: authorization.userId,
    });

    if (!updated) {
      throw new NotFoundException('Module was not found.');
    }

    return updated;
  }

  private async ensureParentIsAvailable(
    parentModuleId: string | null | undefined,
  ): Promise<void> {
    if (!parentModuleId) {
      return;
    }

    const parent = await this.modulesGateway.findById(parentModuleId);

    if (!parent || parent.isDeleted) {
      throw new ConflictException('The selected parent module is unavailable.');
    }
  }

  private async requireLiveModule(moduleId: string): Promise<ManagedModule> {
    const module = await this.modulesGateway.findById(moduleId);

    if (!module || module.isDeleted) {
      throw new NotFoundException('Module was not found.');
    }

    return module;
  }
}
