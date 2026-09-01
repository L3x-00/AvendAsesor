import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { OperationalMetrics } from "@/lib/admin-api/types";
import { AdminDashboard } from "./admin-dashboard";

const baseMetrics: OperationalMetrics = {
  activeDocuments: 12,
  activeModules: 7,
  dismissedUnansweredQuestions: 3,
  pendingIngestionJobs: 0,
  pendingUnansweredQuestions: 0,
  providerCostStatus: "not_configured",
  resolvedUnansweredQuestions: 9,
  totalConversations: 128,
  totalUsers: 25,
};

function metricValue(label: string): string {
  const term = screen.getByText(label);
  const card = term.closest("li");
  if (!card) throw new Error(`No metric card found for ${label}`);
  return within(card).getByText(/^\d[\d.,]*$/).textContent ?? "";
}

describe("AdminDashboard", () => {
  it("summarizes metrics and hides superadmin-only access for an admin", () => {
    render(<AdminDashboard metrics={baseMetrics} role="admin" />);

    expect(metricValue("Usuarios registrados")).toBe("25");
    expect(metricValue("Módulos activos")).toBe("7");
    expect(metricValue("Documentos activos")).toBe("12");
    expect(metricValue("Conversaciones")).toBe("128");

    // No pending work → no attention flag anywhere.
    expect(screen.queryByText("Requiere atención")).not.toBeInTheDocument();

    // Quick access: management sections present; users is superadmin-only.
    expect(
      screen.getByRole("link", { name: /Consultas y reportes/ }),
    ).toHaveAttribute("href", "/admin/operations");
    expect(
      screen.getByRole("link", { name: /Historial de documentos/ }),
    ).toHaveAttribute("href", "/admin/documents");
    expect(
      screen.queryByRole("link", { name: /Usuarios y auditoría/ }),
    ).not.toBeInTheDocument();

    // Health panel calm states.
    expect(screen.getByText("Al día")).toBeVisible();
    expect(screen.getByText("No configurado")).toBeVisible();
  });

  it("flags pending work, shows the badge and reveals users for a superadmin", () => {
    render(
      <AdminDashboard
        metrics={{
          ...baseMetrics,
          pendingIngestionJobs: 2,
          pendingUnansweredQuestions: 4,
        }}
        role="superadmin"
      />,
    );

    // Both pending metrics flagged for attention.
    expect(screen.getAllByText("Requiere atención")).toHaveLength(2);
    expect(metricValue("Consultas por revisar")).toBe("4");
    expect(metricValue("Ingestas en proceso")).toBe("2");

    // Quick access badge and superadmin-only link.
    expect(screen.getByText("4 por revisar")).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Usuarios y auditoría/ }),
    ).toHaveAttribute("href", "/admin/users");

    // Health reflects in-progress ingestion.
    expect(
      screen.getByText("2 en proceso", { selector: "dd" }),
    ).toBeVisible();
  });
});
