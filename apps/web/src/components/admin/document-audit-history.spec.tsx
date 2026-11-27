import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DocumentAuditEvent } from "@/lib/admin-api/types";
import { DocumentAuditHistory } from "./document-audit-history";

function event(
  index: number,
  overrides: Partial<DocumentAuditEvent> = {},
): DocumentAuditEvent {
  return {
    action: "download_url_generated",
    actorName: "Ana",
    details: { ttlSeconds: 60 },
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    occurredAt: "2026-09-26T15:36:00.000Z",
    versionId: null,
    ...overrides,
  };
}

describe("DocumentAuditHistory", () => {
  it("es una sección plegable que muestra solo la última acción", () => {
    const events: DocumentAuditEvent[] = [
      event(1, { occurredAt: "2026-09-26T15:36:00.000Z" }),
      event(2, {
        action: "version_added",
        occurredAt: "2026-09-27T10:00:00.000Z",
      }),
      event(3, { occurredAt: "2026-09-28T09:15:00.000Z" }),
    ];
    const { container } = render(
      <DocumentAuditHistory context={{}} events={events} />,
    );

    const section = container.querySelector("details")!;
    expect(section).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Historial del documento"));
    expect(screen.getByText("Última acción registrada")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1); // solo la última acción
    expect(screen.getByText("PDF abierto o descargado")).toBeVisible();
    expect(screen.queryByText("Nueva versión del PDF cargada")).toBeNull();
    expect(screen.queryByText(/Ver \d+ eventos/)).toBeNull();
    expect(container.textContent).not.toContain("ttlSeconds");
    expect(container.querySelector("pre")).toBeNull();
  });

  it("muestra una sola vez la acción repetida con la fecha más reciente", () => {
    const { container } = render(
      <DocumentAuditHistory
        context={{}}
        events={[
          event(1, { occurredAt: "2026-09-26T15:36:00.000Z" }),
          event(2, { occurredAt: "2026-09-27T08:00:00.000Z" }),
          event(3, { occurredAt: "2026-09-28T11:30:00.000Z" }),
        ]}
      />,
    );

    fireEvent.click(screen.getByText("Historial del documento"));
    expect(screen.getAllByText("PDF abierto o descargado")).toHaveLength(1);
    expect(container.querySelectorAll("time")).toHaveLength(1);
    expect(container.querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-09-28T11:30:00.000Z",
    );
  });

  it("indica cuando aún no hay eventos", () => {
    render(<DocumentAuditHistory context={{}} events={[]} />);
    expect(screen.getByText("Aún no hay eventos registrados.")).toBeInTheDocument();
  });
});
