import type { AccountStatus, UserRole } from '../users/domain/user-profile';

export interface AdministrativeUser {
  accountStatus: AccountStatus;
  fullName: string;
  id: string;
  lastAccessAt: string | null;
  role: UserRole;
}

/**
 * Derived, mutually exclusive access state shown as a per-row badge. Uses the
 * same 7-day threshold and expiry rule as the Inicio dashboard (ADR-0018).
 */
export type AdministrativeUserAccessState =
  'activo' | 'expirado' | 'pausado' | 'por_vencer';

export interface AdministrativeUserDirectoryEntry extends AdministrativeUser {
  accessExpiresAt: string | null;
  accessStartAt: string | null;
  accessState: AdministrativeUserAccessState;
  /** Read from auth.users; the directory never duplicates the address. */
  email: string | null;
  phone: string | null;
  createdByName: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
}

export type AdministrativeUserGroup = 'docente' | 'staff';
export type AdministrativeUserStatusFilter = AccountStatus;

export interface AdministrativeUserPage {
  items: AdministrativeUserDirectoryEntry[];
  limit: number;
  offset: number;
  total: number;
}

/**
 * Cumulative bucket counts matching the Inicio dashboard definitions
 * (`expiringSoon` is a subset of `active`).
 */
export interface AdministrativeUserCounts {
  active: number;
  expired: number;
  expiringSoon: number;
  suspended: number;
  total: number;
}

export type OperationalAuditAction =
  | 'access_window_changed'
  | 'chat_history_deleted'
  | 'unanswered_question_reviewed'
  | 'user_created'
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
  /**
   * Creates the auth identity by invitation (the person sets their own
   * password) and then completes the profile. A failure after the invite
   * removes the half-created identity so the address stays usable.
   */
  createUser(input: {
    accessExpiresAt: string | null;
    accessStartAt: string | null;
    actorId: string;
    email: string;
    fullName: string;
    phone: string | null;
    role: UserRole;
  }): Promise<AdministrativeUserDirectoryEntry>;
  countUsers(input: {
    actorId: string;
    group: AdministrativeUserGroup | null;
    search: string | null;
  }): Promise<AdministrativeUserCounts>;
  listAuditEvents(input: {
    actorId: string;
    limit: number;
  }): Promise<OperationalAuditEvent[]>;
  listUsers(input: {
    accessState: AdministrativeUserAccessState | null;
    actorId: string;
    group: AdministrativeUserGroup | null;
    limit: number;
    offset: number;
    search: string | null;
    status: AdministrativeUserStatusFilter | null;
  }): Promise<AdministrativeUserPage>;
  updateAccessWindow(input: {
    accessExpiresAt: string | null;
    accessStartAt: string | null;
    actorId: string;
    reason: string;
    targetUserId: string;
  }): Promise<AdministrativeUserDirectoryEntry>;
  updateUser(input: {
    accountStatus: AccountStatus | null;
    actorId: string;
    reason: string;
    role: UserRole | null;
    targetUserId: string;
  }): Promise<AdministrativeUser>;
}
