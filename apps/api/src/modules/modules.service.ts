import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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

    if (dto.parentModuleId) {
      await this.assertCanManageModule(
        authorization.userId,
        dto.parentModuleId,
      );
    } else if (authorization.role !== 'superadmin') {
      throw new ForbiddenException(
        'Creating a root module requires superadministrator access.',
      );
    }

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

  async listSummaries(
    dto: ListModulesQueryDto,
    authorization: AuthorizationContext,
  ) {
    const modules = await this.modulesGateway.listSummaries({
      status: dto.status ?? 'all',
    });
    if (authorization.role === 'superadmin') {
      return modules.map((module) => ({ ...module, canManage: true }));
    }
    const allowed = await Promise.all(
      modules.map((module) =>
        this.modulesGateway.canManageModule(authorization.userId, module.id),
      ),
    );
    const grantedIds = new Set(
      modules.filter((_, index) => allowed[index]).map((module) => module.id),
    );
    return modules.flatMap((module, index) => {
      if (allowed[index]) return [{ ...module, canManage: true }];
      // Una raíz no concedida sigue siendo un contenedor de navegación si
      // el administrador tiene acceso a uno de sus submódulos.
      if (
        module.parentModuleId === null &&
        modules.some(
          (child) =>
            child.parentModuleId === module.id && grantedIds.has(child.id),
        )
      ) {
        return [
          {
            ...module,
            canManage: false,
            documentCount: 0,
            submoduleCount: modules.filter(
              (child) =>
                child.parentModuleId === module.id && grantedIds.has(child.id),
            ).length,
          },
        ];
      }
      return [];
    });
  }

  async findOne(
    moduleId: string,
    authorization: AuthorizationContext,
  ): Promise<ManagedModule> {
    const module = await this.requireLiveModule(moduleId);
    await this.assertCanReadModule(authorization, moduleId);
    return module;
  }

  async list(
    dto: ListModulesQueryDto,
    authorization: AuthorizationContext,
  ): Promise<ManagedModule[]> {
    if (dto.parentModuleId) {
      await this.assertCanReadModule(authorization, dto.parentModuleId);
    }
    const modules = await this.modulesGateway.list({
      parentModuleId: dto.parentModuleId,
      status: dto.status ?? 'all',
    });
    return this.visibleToAdministrator(modules, authorization);
  }

  async logicalDelete(
    moduleId: string,
    dto: LogicalDeleteModuleDto,
    authorization: AuthorizationContext,
  ): Promise<void> {
    const module = await this.requireLiveModule(moduleId);
    await this.assertCanManageModule(authorization.userId, module.id);

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
    await this.assertCanManageModule(authorization.userId, moduleId);

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
    await this.assertCanManageModule(authorization.userId, module.id);

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
      if (dto.parentModuleId) {
        await this.assertCanManageModule(
          authorization.userId,
          dto.parentModuleId,
        );
      }
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

  private async assertCanManageModule(
    actorId: string,
    moduleId: string,
  ): Promise<void> {
    if (!(await this.modulesGateway.canManageModule(actorId, moduleId))) {
      throw new ForbiddenException(
        'Your administrator profile cannot manage this module.',
      );
    }
  }

  private async assertCanReadModule(
    authorization: AuthorizationContext,
    moduleId: string,
  ): Promise<void> {
    if (
      authorization.role !== 'superadmin' &&
      !(await this.modulesGateway.canManageModule(
        authorization.userId,
        moduleId,
      ))
    ) {
      throw new ForbiddenException(
        'Your administrator profile cannot access this module.',
      );
    }
  }

  private async visibleToAdministrator<T extends ManagedModule>(
    modules: T[],
    authorization: AuthorizationContext,
  ): Promise<T[]> {
    if (authorization.role === 'superadmin') return modules;
    const allowed = await Promise.all(
      modules.map((module) =>
        this.modulesGateway.canManageModule(authorization.userId, module.id),
      ),
    );
    return modules.filter((_, index) => allowed[index]);
  }

  private async requireLiveModule(moduleId: string): Promise<ManagedModule> {
    const module = await this.modulesGateway.findById(moduleId);

    if (!module || module.isDeleted) {
      throw new NotFoundException('Module was not found.');
    }

    return module;
  }
}
