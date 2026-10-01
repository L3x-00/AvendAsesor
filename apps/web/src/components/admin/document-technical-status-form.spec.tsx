import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentTechnicalStatusForm } from "./document-technical-status-form";

vi.mock("@/app/admin/actions", () => ({
  setDocumentTechnicalStatusAction: vi.fn(async () => ({ status: "idle" })),
}));

const documentId = "d60530ac-6fba-46bd-bac7-940c0655db54";

describe("DocumentTechnicalStatusForm", () => {
  it("shows the saved status after it changes, instead of the stale default", () => {
    const { rerender } = render(
      <DocumentTechnicalStatusForm
        approvalStatus="pending_approval"
        approvedVersionId={null}
        currentIngestionStatus="indexed"
        documentId={documentId}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Estado" })).toHaveValue(
      "pending_approval",
    );

    // La página se vuelve a pintar con el estado ya guardado como Listo.
    rerender(
      <DocumentTechnicalStatusForm
        approvalStatus="ready"
        approvedVersionId="0f6e4c2b-1c39-4a77-9d1e-3b5f2a7c8d90"
        currentIngestionStatus="indexed"
        documentId={documentId}
      />,
    );
    const select = screen.getByRole("combobox", { name: "Estado" });
    expect(select).toHaveValue("ready");

    // El reinicio del formulario tras guardar conserva el estado nuevo.
    select.closest("form")?.reset();
    expect(screen.getByRole("combobox", { name: "Estado" })).toHaveValue(
      "ready",
    );
  });

  it("only offers Listo for an indexed version and explains why", () => {
    render(
      <DocumentTechnicalStatusForm
        approvalStatus="pending_approval"
        approvedVersionId={null}
        currentIngestionStatus="processing"
        documentId={documentId}
      />,
    );

    expect(
      screen.getByRole("option", { name: "Listo (disponible para consultas)" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/la versión debe estar indexada/),
    ).toBeInTheDocument();
  });
});
