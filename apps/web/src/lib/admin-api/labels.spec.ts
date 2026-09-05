import { describe, expect, it } from "vitest";
import {
  formatAccountStatus,
  formatOperationalAuditAction,
  formatOperationalAuditResourceType,
  formatUserRole,
  getDocumentIngestionStatusContent,
} from "./labels";

describe("administrative display labels", () => {
  it("uses Spanish labels for every role and account state exposed to the UI", () => {
    expect(formatUserRole("docente")).toBe("Docente");
    expect(formatUserRole("admin")).toBe("Administrador");
    expect(formatUserRole("superadmin")).toBe("Superadministrador");
    expect(formatAccountStatus("active")).toBe("Activo");
    expect(formatAccountStatus("suspended")).toBe("Pausado");
  });

  it("does not expose technical audit enum values in the administrative table", () => {
    expect(formatOperationalAuditAction("chat_history_deleted")).toBe(
      "Historial de conversación eliminado",
    );
    expect(formatOperationalAuditAction("unanswered_question_reviewed")).toBe(
      "Consulta no resuelta revisada",
    );
    expect(formatOperationalAuditAction("user_role_changed")).toBe(
      "Rol de usuario actualizado",
    );
    expect(formatOperationalAuditAction("user_status_changed")).toBe(
      "Estado de cuenta actualizado",
    );
    expect(formatOperationalAuditResourceType("chat_conversation")).toBe(
      "Conversación",
    );
    expect(formatOperationalAuditResourceType("unanswered_question")).toBe(
      "Consulta no resuelta",
    );
    expect(formatOperationalAuditResourceType("profile")).toBe(
      "Perfil de usuario",
    );
  });

  it("explains every document ingestion state in Spanish without technical errors", () => {
    expect(getDocumentIngestionStatusContent("pending")).toEqual({
      description:
        "Esta versión está pendiente de procesamiento. Podrá aprobarse cuando termine la indexación.",
      label: "Pendiente",
    });
    expect(getDocumentIngestionStatusContent("processing")).toEqual({
      description:
        "Estamos preparando esta versión. Podrá aprobarse cuando termine la indexación.",
      label: "Procesando",
    });
    expect(getDocumentIngestionStatusContent("indexed")).toEqual({
      description:
        "El procesamiento automático terminó. Su uso en consultas depende de que el documento esté aprobado como Listo.",
      label: "Indexado",
    });
    expect(getDocumentIngestionStatusContent("failed")).toEqual({
      description:
        "Esta versión no está disponible para consultas. Carga una nueva versión si el problema persiste.",
      label: "No se pudo indexar",
    });
  });
});
