import { describe, expect, it } from "vitest";
import {
  formatAccountStatus,
  formatOperationalAuditAction,
  formatOperationalAuditResourceType,
  formatUserRole,
} from "./labels";

describe("administrative display labels", () => {
  it("uses Spanish labels for every role and account state exposed to the UI", () => {
    expect(formatUserRole("docente")).toBe("Docente");
    expect(formatUserRole("admin")).toBe("Administrador");
    expect(formatUserRole("superadmin")).toBe("Superadministrador");
    expect(formatAccountStatus("active")).toBe("Activa");
    expect(formatAccountStatus("suspended")).toBe("Suspendida");
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
});
