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
      "El documento está en procesamiento automático antes de quedar listo; no requiere una aprobación manual.",
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
  active: "Activa",
  suspended: "Suspendida",
} as const satisfies Record<AdministrativeUser["accountStatus"], string>;

const documentIngestionStatusContent = {
  failed: {
    description:
      "Esta versión no está disponible para consultas. Carga una nueva versión si el problema persiste.",
    label: "No se pudo indexar",
  },
  indexed: {
    description:
      "Esta versión ya está disponible para consultas en el asistente.",
    label: "Indexado",
  },
  pending: {
    description:
      "Esta versión está pendiente de procesamiento. Estará disponible para consultas cuando termine la indexación.",
    label: "Pendiente",
  },
  processing: {
    description:
      "Estamos preparando esta versión. Estará disponible para consultas cuando termine la indexación.",
    label: "Procesando",
  },
} as const satisfies Record<
  ManagedDocumentVersion["ingestionStatus"],
  { description: string; label: string }
>;

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
