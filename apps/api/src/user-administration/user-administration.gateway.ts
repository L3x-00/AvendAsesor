import type { AccountStatus, UserRole } from '../users/domain/user-profile';

export interface AdministrativeUser {
  accountStatus: AccountStatus;
  fullName: string;
  id: string;
  lastAccessAt: string | null;
  role: UserRole;
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
    limit: number;
    search: string | null;
  }): Promise<AdministrativeUser[]>;
  updateUser(input: {
    accountStatus: AccountStatus | null;
    actorId: string;
    reason: string;
    role: UserRole | null;
    targetUserId: string;
  }): Promise<AdministrativeUser>;
}
