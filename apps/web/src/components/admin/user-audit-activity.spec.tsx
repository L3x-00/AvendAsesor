import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { OperationalAuditEvent } from "@/lib/admin-api/types";
import {
  AUDIT_ACTIVITY_PAGE_SIZE,
  UserAuditActivity,
} from "./user-audit-activity";

function event(index: number): OperationalAuditEvent {
  const suffix = String(index).padStart(12, "0");
  return {
    action: "user_created",
    actorId: `00000000-0000-4000-8000-${suffix}`,
    actorRole: "superadmin",
    id: `10000000-0000-4000-8000-${suffix}`,
    metadata: { email: `usuario-${index}@example.test` },
    occurredAt: new Date(Date.UTC(2026, 9, index, 15)).toISOString(),
    resourceId: `20000000-0000-4000-8000-${suffix}`,
    resourceType: "profile",
  };
}

describe("UserAuditActivity", () => {
  it("muestra diez eventos por página y permite recorrer el historial", () => {
    const events = Array.from({ length: 12 }, (_, index) => event(index + 1));
    render(<UserAuditActivity events={events} />);

    const table = screen.getByRole("table", {
      name: "Actividad administrativa auditada",
    });
    expect(within(table).getAllByRole("row")).toHaveLength(
      AUDIT_ACTIVITY_PAGE_SIZE + 1,
    );
    expect(screen.getByText("Mostrando 1–10 de 12 eventos.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("Mostrando 11–12 de 12 eventos.")).toBeVisible();
    expect(screen.getByText("Página 2 de 2")).toBeVisible();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  });

  it("mantiene un vacío explícito cuando todavía no existe actividad", () => {
    render(<UserAuditActivity events={[]} />);

    expect(
      screen.getByText("Aún no hay eventos administrativos para mostrar."),
    ).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
