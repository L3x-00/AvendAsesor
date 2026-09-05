import type {
  AdministrativeUser,
  DocumentSituation,
  DocumentTechnicalStatus,
  ManagedDocumentVersion,
  OperationalAuditEvent,
} from "./types";

const documentSituationLabels = {
  archived: "Archivado",
  current: "Vigente",
  replaced: "Reemplazado / Sin vigencia",
} as const satisfies Record<DocumentSituation, string>;

const documentTechnicalStatusContent = {
  error: {
    description:
      "El sistema detectó un problema de lectura, procesamiento o indexación.",
    label: "Error",
  },
  pending_approval: {
    description:
      "El PDF está cargado, pero aún no está habilitado. Cuando termine el procesamiento, un administrador puede marcarlo como Listo.",
    label: "Pendiente de aprobación",
  },
  ready: {
    description: "El documento fue procesado y está listo para consulta.",
    label: "Listo",
  },
} as const satisfies Record<
  DocumentTechnicalStatus,
  { description: string; label: string }
>;

const userRoleLabels = {
  admin: "Administrador",
  docente: "Docente",
  superadmin: "Superadministrador",
} as const satisfies Record<AdministrativeUser["role"], string>;

const accountStatusLabels = {
  active: "Activo",
  suspended: "Pausado",
} as const satisfies Record<AdministrativeUser["accountStatus"], string>;

const accessStateLabels = {
  activo: "Activo",
  expirado: "Expirado",
  pausado: "Pausado",
  por_vencer: "Por vencer",
} as const satisfies Record<AdministrativeUser["accessState"], string>;

export function formatAccessState(
  state: AdministrativeUser["accessState"],
): string {
  return accessStateLabels[state];
}

const documentIngestionStatusContent = {
  failed: {
    description:
      "Esta versión no está disponible para consultas. Carga una nueva versión si el problema persiste.",
    label: "No se pudo indexar",
  },
  indexed: {
    description:
      "El procesamiento automático terminó. Su uso en consultas depende de que el documento esté aprobado como Listo.",
    label: "Indexado",
  },
  pending: {
    description:
      "Esta versión está pendiente de procesamiento. Podrá aprobarse cuando termine la indexación.",
    label: "Pendiente",
  },
  processing: {
    description:
      "Estamos preparando esta versión. Podrá aprobarse cuando termine la indexación.",
    label: "Procesando",
  },
} as const satisfies Record<
  ManagedDocumentVersion["ingestionStatus"],
  { description: string; label: string }
>;

const operationalAuditActionLabels = {
  access_window_changed: "Vigencia de acceso actualizada",
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

export function getDocumentIngestionStatusContent(
  status: ManagedDocumentVersion["ingestionStatus"],
): { description: string; label: string } {
  return documentIngestionStatusContent[status];
}

export function formatDocumentSituation(situation: DocumentSituation): string {
  return documentSituationLabels[situation];
}

export function getDocumentTechnicalStatusContent(
  status: DocumentTechnicalStatus,
): { description: string; label: string } {
  return documentTechnicalStatusContent[status];
}

export function formatDocumentType(documentType: string): string {
  return documentType
    .toLocaleLowerCase("es")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("es") + part.slice(1))
    .join(" ");
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
