import { Inject, Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../authorization';
import { SUPABASE_MODULE_PERMISSIONS_GATEWAY } from '../supabase/supabase.constants';
import type { SetModulePermissionDto } from './dto/set-module-permission.dto';
import type {
  AdminModulePermission,
  ModulePermissionsGateway,
} from './module-permissions.gateway';

@Injectable()
export class ModulePermissionsService {
  constructor(
    @Inject(SUPABASE_MODULE_PERMISSIONS_GATEWAY)
    private readonly gateway: ModulePermissionsGateway,
  ) {}

  list(authorization: AuthorizationContext): Promise<AdminModulePermission[]> {
    return this.gateway.list(authorization.userId);
  }

  set(
    targetUserId: string,
    dto: SetModulePermissionDto,
    authorization: AuthorizationContext,
  ): Promise<AdminModulePermission> {
    return this.gateway.set({
      actorId: authorization.userId,
      canAccess: dto.canAccess,
      reason: dto.reason,
      targetUserId,
    });
  }
}
