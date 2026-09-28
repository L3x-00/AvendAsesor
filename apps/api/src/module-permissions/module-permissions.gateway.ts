export interface AdminModulePermission {
  canAccess: boolean;
  fullName: string;
  /** Módulos/submódulos concedidos (el superadmin ve todos los activos). */
  moduleIds: string[];
  role: 'admin' | 'superadmin';
  updatedAt: string | null;
  updatedBy: string | null;
  userId: string;
}

export interface ModulePermissionsGateway {
  list(actorId: string): Promise<AdminModulePermission[]>;
  set(input: {
    actorId: string;
    canAccess: boolean;
    reason: string;
    targetUserId: string;
  }): Promise<AdminModulePermission>;
  /** Reemplaza el conjunto de módulos concedidos de un administrador. */
  setGrants(input: {
    actorId: string;
    moduleIds: string[];
    reason: string;
    targetUserId: string;
  }): Promise<void>;
}
