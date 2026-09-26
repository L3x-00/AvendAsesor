import type { DocumentAuditEvent } from "./types";
import { archiveReasonLabel } from "./document-taxonomy";

/**
 * Traduce un evento del historial del documento a lenguaje llano.
 *
 * El historial mostraba el `details` crudo en JSON ({"ttlSeconds": 60},
 * {"moduleId": "f532…"}), que no le dice nada a un administrador. Aquí cada
 * acción se convierte en un título claro y, solo cuando aporta, en líneas de
 * detalle legibles (nombres de módulo en vez de identificadores, estados en
 * español). Los datos técnicos sin valor para la gestión se omiten.
 */
export interface DescribedAuditEvent {
  details: string[];
  /** Eventos rutinarios (p. ej. abrir el PDF) que se pueden mostrar atenuados. */
  routine: boolean;
  title: string;
}

export interface AuditDescriptionContext {
  documentTitleById?: ReadonlyMap<string, string>;
  moduleNameById?: ReadonlyMap<string, string>;
}

const SITUATION_LABELS: Record<string, string> = {
  archived: "Archivado",
  current: "Vigente",
  replaced: "Reemplazado / sin vigencia",
};

const TECHNICAL_STATUS_LABELS: Record<string, string> = {
  error: "Error",
  pending_approval: "Pendiente de aprobación",
  ready: "Listo",
};

const ACTION_TITLES: Record<string, string> = {
  activated: "Documento marcado como vigente",
  created: "Documento registrado",
  deactivated: "Documento archivado o reemplazado",
  download_url_generated: "PDF abierto o descargado",
  logically_deleted: "Documento eliminado",
  metadata_updated: "Datos del documento actualizados",
  module_linked: "Módulo asociado",
  module_unlinked: "Módulo retirado",
  restored: "Documento restaurado",
  version_added: "Nueva versión del PDF cargada",
};

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function moduleName(
  value: unknown,
  context: AuditDescriptionContext,
): string {
  const id = text(value);
  return (id && context.moduleNameById?.get(id)) ?? "un módulo que ya no está disponible";
}

export function describeAuditEvent(
  event: Pick<DocumentAuditEvent, "action" | "details">,
  context: AuditDescriptionContext = {},
): DescribedAuditEvent {
  const { action, details } = event;
  const lines: string[] = [];

  // El cambio de estado técnico se registra como `metadata_updated` con marca.
  if (details.event === "technical_status_changed") {
    const status = text(details.technicalStatus);
    return {
      details: status
        ? [`Nuevo estado técnico: ${TECHNICAL_STATUS_LABELS[status] ?? status}.`]
        : [],
      routine: false,
      title: "Estado técnico actualizado",
    };
  }

  switch (action) {
    case "created": {
      const situation = text(details.situation);
      const status = text(details.technicalStatus);
      const count = typeof details.moduleCount === "number" ? details.moduleCount : null;
      if (situation) lines.push(`Situación inicial: ${SITUATION_LABELS[situation] ?? situation}.`);
      if (status) lines.push(`Estado técnico inicial: ${TECHNICAL_STATUS_LABELS[status] ?? status}.`);
      if (count !== null) {
        lines.push(`Asociado a ${count} ${count === 1 ? "módulo" : "módulos"}.`);
      }
      break;
    }
    case "module_linked":
    case "module_unlinked":
      lines.push(`Módulo: ${moduleName(details.moduleId, context)}.`);
      break;
    case "version_added": {
      const version = text(details.versionNumber);
      if (version) lines.push(`Versión número ${version}.`);
      break;
    }
    // metadata_updated: el registro guarda todos los campos enviados por el
    // formulario, no solo los que cambiaron; listarlos afirmaría cambios que
    // no ocurrieron. Basta con el título del evento.
    case "activated":
    case "deactivated": {
      const situation = text(details.situation);
      if (situation) lines.push(`Nueva situación: ${SITUATION_LABELS[situation] ?? situation}.`);
      const archiveCode = text(details.archiveReasonCode);
      if (archiveCode) lines.push(`Motivo del archivo: ${archiveReasonLabel(archiveCode)}.`);
      const archiveDetail = text(details.archiveReasonDetail);
      if (archiveDetail) lines.push(`Detalle: ${archiveDetail}`);
      const replacementId = text(details.replacementDocumentId);
      if (replacementId) {
        const title = context.documentTitleById?.get(replacementId);
        lines.push(
          title ? `Reemplazado por: ${title}.` : "Reemplazado por otro documento.",
        );
      }
      const replacementYear = text(details.replacementYear);
      if (replacementYear) lines.push(`Año del reemplazo: ${replacementYear}.`);
      const reason = text(details.reason);
      if (reason) lines.push(`Motivo: ${reason}`);
      const observation = text(details.observation);
      if (observation) lines.push(`Observación: ${observation}`);
      break;
    }
    case "logically_deleted":
    case "restored": {
      const reason = text(details.reason);
      if (reason) lines.push(`Motivo: ${reason}`);
      break;
    }
    // download_url_generated: la duración del enlace temporal (ttlSeconds) es
    // un dato técnico; basta con saber quién abrió el PDF y cuándo.
    default:
      break;
  }

  return {
    details: lines,
    routine: action === "download_url_generated",
    title: ACTION_TITLES[action] ?? "Cambio registrado",
  };
}
