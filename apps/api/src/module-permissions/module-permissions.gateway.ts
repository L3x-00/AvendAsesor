export interface AdminModulePermission {
  canAccess: boolean;
  fullName: string;
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
}
