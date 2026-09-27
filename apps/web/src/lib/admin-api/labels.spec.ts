import { describe, expect, it } from "vitest";
import {
  formatAccountStatus,
  formatOperationalAuditAction,
  formatOperationalAuditDetail,
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

describe("detalle de la actividad auditada", () => {
  const base = { metadata: {} };

  it("describe cada cambio de módulo con su nombre y motivo", () => {
    expect(formatOperationalAuditAction("module_created")).toBe(
      "Módulo creado",
    );
    expect(formatOperationalAuditAction("user_created")).toBe("Usuario creado");
    expect(formatOperationalAuditResourceType("module")).toBe(
      "Módulo o submódulo",
    );
    expect(
      formatOperationalAuditDetail({
        action: "module_created",
        metadata: { moduleName: "Escala remunerativa" },
      }),
    ).toBe("Escala remunerativa");
    expect(
      formatOperationalAuditDetail({
        action: "module_updated",
        metadata: { moduleName: "Remuneraciones", previousName: "Sueldos" },
      }),
    ).toBe("Sueldos → Remuneraciones");
    expect(
      formatOperationalAuditDetail({
        action: "module_updated",
        metadata: { moduleName: "Remuneraciones" },
      }),
    ).toBe("Remuneraciones");
    expect(
      formatOperationalAuditDetail({
        action: "module_status_changed",
        metadata: {
          isActive: false,
          moduleName: "Permuta docente",
          reason: "Temporada cerrada",
        },
      }),
    ).toBe("Permuta docente: desactivado — Temporada cerrada");
    expect(
      formatOperationalAuditDetail({
        action: "module_status_changed",
        metadata: { isActive: true },
      }),
    ).toBe("activado");
    expect(
      formatOperationalAuditDetail({
        action: "module_deleted",
        metadata: { moduleName: "Duplicado", reason: "Repetido" },
      }),
    ).toBe("Duplicado — Repetido");
    expect(
      formatOperationalAuditDetail({
        action: "module_deleted",
        metadata: { reason: "Repetido" },
      }),
    ).toBe("Repetido");
  });

  it("traduce los cambios de usuario y omite datos desconocidos", () => {
    expect(
      formatOperationalAuditDetail({
        action: "user_role_changed",
        metadata: { fromRole: "docente", toRole: "admin" },
      }),
    ).toBe("Docente → Administrador");
    expect(
      formatOperationalAuditDetail({
        action: "user_status_changed",
        metadata: { fromStatus: "active", toStatus: "suspended" },
      }),
    ).toBe("Activo → Pausado");
    expect(
      formatOperationalAuditDetail({
        action: "user_created",
        metadata: { role: "docente" },
      }),
    ).toBe("Rol: Docente");
    expect(
      formatOperationalAuditDetail({
        action: "user_role_changed",
        metadata: { fromRole: "otro", toRole: "admin" },
      }),
    ).toBeNull();
    expect(
      formatOperationalAuditDetail({
        action: "user_status_changed",
        metadata: { fromStatus: 3 },
      }),
    ).toBeNull();
    expect(
      formatOperationalAuditDetail({ action: "user_created", ...base }),
    ).toBeNull();
    expect(
      formatOperationalAuditDetail({ action: "chat_history_deleted", ...base }),
    ).toBeNull();
  });
});
