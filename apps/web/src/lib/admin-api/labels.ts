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
  module_created: "Módulo creado",
  module_deleted: "Módulo eliminado",
  module_status_changed: "Estado de módulo actualizado",
  module_updated: "Módulo editado",
  unanswered_question_reviewed: "Consulta no resuelta revisada",
  user_created: "Usuario creado",
  user_role_changed: "Rol de usuario actualizado",
  user_status_changed: "Estado de cuenta actualizado",
} as const satisfies Record<OperationalAuditEvent["action"], string>;

const operationalAuditResourceLabels = {
  chat_conversation: "Conversación",
  module: "Módulo o submódulo",
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

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Qué cambió, en una línea legible («Escala remunerativa: desactivado —
 * Temporada cerrada»). Solo usa los datos que guarda el propio evento.
 */
export function formatOperationalAuditDetail(
  event: Pick<OperationalAuditEvent, "action" | "metadata">,
): string | null {
  const metadata = event.metadata;
  const moduleName = text(metadata.moduleName);
  const reason = text(metadata.reason);
  switch (event.action) {
    case "module_created":
      return moduleName;
    case "module_updated": {
      const previous = text(metadata.previousName);
      return previous && moduleName
        ? `${previous} → ${moduleName}`
        : moduleName;
    }
    case "module_status_changed": {
      const state = metadata.isActive === true ? "activado" : "desactivado";
      const base = moduleName ? `${moduleName}: ${state}` : state;
      return reason ? `${base} — ${reason}` : base;
    }
    case "module_deleted":
      return moduleName && reason
        ? `${moduleName} — ${reason}`
        : (moduleName ?? reason);
    case "user_role_changed": {
      const from = text(metadata.fromRole);
      const to = text(metadata.toRole);
      return from &&
        to &&
        Object.hasOwn(userRoleLabels, from) &&
        Object.hasOwn(userRoleLabels, to)
        ? `${userRoleLabels[from as keyof typeof userRoleLabels]} → ${userRoleLabels[to as keyof typeof userRoleLabels]}`
        : null;
    }
    case "user_status_changed": {
      const from = text(metadata.fromStatus);
      const to = text(metadata.toStatus);
      return from &&
        to &&
        Object.hasOwn(accountStatusLabels, from) &&
        Object.hasOwn(accountStatusLabels, to)
        ? `${accountStatusLabels[from as keyof typeof accountStatusLabels]} → ${accountStatusLabels[to as keyof typeof accountStatusLabels]}`
        : null;
    }
    case "user_created": {
      const role = text(metadata.role);
      return role && Object.hasOwn(userRoleLabels, role)
        ? `Rol: ${userRoleLabels[role as keyof typeof userRoleLabels]}`
        : null;
    }
    default:
      return null;
  }
}
