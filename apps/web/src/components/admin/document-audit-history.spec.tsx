import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocumentAuditHistory, VISIBLE_AUDIT_EVENTS } from "./document-audit-history";

function event(index: number) {
  return {
    action: "download_url_generated",
    actorName: "Ana",
    details: { ttlSeconds: 60 },
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    occurredAt: "2026-09-26T15:36:00.000Z",
    versionId: null,
  };
}

describe("DocumentAuditHistory", () => {
  it("explica para qué sirve, sin JSON, y pliega los eventos antiguos", () => {
    const events = Array.from({ length: VISIBLE_AUDIT_EVENTS + 2 }, (_, i) => event(i));
    const { container } = render(<DocumentAuditHistory context={{}} events={events} />);

    const section = screen.getByRole("region", { name: "Historial del documento" });
    expect(within(section).getByText(/Es solo de consulta/)).toBeVisible();
    expect(container.textContent).not.toContain("ttlSeconds");
    expect(container.querySelector("pre")).toBeNull();
    expect(screen.getByText("Ver 2 eventos anteriores")).toBeInTheDocument();
  });

  it("indica cuando aún no hay eventos", () => {
    render(<DocumentAuditHistory context={{}} events={[]} />);
    expect(screen.getByText("Aún no hay eventos registrados.")).toBeVisible();
  });
});
