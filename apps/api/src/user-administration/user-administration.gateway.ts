import type { AccountStatus, UserRole } from '../users/domain/user-profile';

export interface AdministrativeUser {
  accountStatus: AccountStatus;
  fullName: string;
  id: string;
  lastAccessAt: string | null;
  role: UserRole;
}

export type AdministrativeUserGroup = 'docente' | 'staff';
export type AdministrativeUserStatusFilter = AccountStatus;

export interface AdministrativeUserPage {
  items: AdministrativeUser[];
  limit: number;
  offset: number;
  total: number;
}

export type OperationalAuditAction =
  | 'chat_history_deleted'
  | 'unanswered_question_reviewed'
  | 'user_role_changed'
  | 'user_status_changed';

export interface OperationalAuditEvent {
  action: OperationalAuditAction;
  actorId: string;
  actorRole: UserRole;
  id: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
  resourceId: string;
  resourceType: 'chat_conversation' | 'unanswered_question' | 'profile';
}

export interface UserAdministrationGateway {
  listAuditEvents(input: {
    actorId: string;
    limit: number;
  }): Promise<OperationalAuditEvent[]>;
  listUsers(input: {
    actorId: string;
    group: AdministrativeUserGroup | null;
    limit: number;
    offset: number;
    search: string | null;
    status: AdministrativeUserStatusFilter | null;
  }): Promise<AdministrativeUserPage>;
  updateUser(input: {
    accountStatus: AccountStatus | null;
    actorId: string;
    reason: string;
    role: UserRole | null;
    targetUserId: string;
  }): Promise<AdministrativeUser>;
}
