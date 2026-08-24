import type { AdministrativeUser, OperationalAuditEvent } from "./types";

const userRoleLabels = {
  admin: "Administrador",
  docente: "Docente",
  superadmin: "Superadministrador",
} as const satisfies Record<AdministrativeUser["role"], string>;

const accountStatusLabels = {
  active: "Activa",
  suspended: "Suspendida",
} as const satisfies Record<AdministrativeUser["accountStatus"], string>;

const operationalAuditActionLabels = {
  chat_history_deleted: "Historial de conversación eliminado",
  unanswered_question_reviewed: "Consulta no resuelta revisada",
  user_role_changed: "Rol de usuario actualizado",
  user_status_changed: "Estado de cuenta actualizado",
} as const satisfies Record<OperationalAuditEvent["action"], string>;

const operationalAuditResourceLabels = {
  chat_conversation: "Conversación",
  profile: "Perfil de usuario",
  unanswered_question: "Consulta no resuelta",
} as const satisfies Record<OperationalAuditEvent["resourceType"], string>;

export function formatUserRole(role: AdministrativeUser["role"]): string {
  return userRoleLabels[role];
}

export function formatAccountStatus(
  status: AdministrativeUser["accountStatus"],
): string {
  return accountStatusLabels[status];
}

export function formatOperationalAuditAction(
  action: OperationalAuditEvent["action"],
): string {
  return operationalAuditActionLabels[action];
}

export function formatOperationalAuditResourceType(
  resourceType: OperationalAuditEvent["resourceType"],
): string {
  return operationalAuditResourceLabels[resourceType];
}
