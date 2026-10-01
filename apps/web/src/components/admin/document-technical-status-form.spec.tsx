import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { setDocumentTechnicalStatusAction } from "@/app/admin/actions";
import { DocumentTechnicalStatusForm } from "./document-technical-status-form";

vi.mock("@/app/admin/actions", () => ({
  setDocumentTechnicalStatusAction: vi.fn(async () => ({
    message: "Estado técnico actualizado.",
    status: "success",
  })),
}));

const documentId = "d60530ac-6fba-46bd-bac7-940c0655db54";
const approvedVersionId = "0f6e4c2b-1c39-4a77-9d1e-3b5f2a7c8d90";

describe("DocumentTechnicalStatusForm", () => {
  it("keeps showing Listo after saving it, instead of snapping back to Pendiente", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <DocumentTechnicalStatusForm
        approvalStatus="pending_approval"
        approvedVersionId={null}
        currentIngestionStatus="indexed"
        documentId={documentId}
      />,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Estado" }),
      "ready",
    );
    await user.click(
      screen.getByRole("button", { name: "Guardar estado técnico" }),
    );
    // Éxito confirmado: el formulario se reinicia.
    expect(
      await screen.findByText("Estado técnico actualizado."),
    ).toBeInTheDocument();
    expect(vi.mocked(setDocumentTechnicalStatusAction)).toHaveBeenCalled();

    // La página se vuelve a pintar con el estado ya guardado como Listo.
    rerender(
      <DocumentTechnicalStatusForm
        approvalStatus="ready"
        approvedVersionId={approvedVersionId}
        currentIngestionStatus="indexed"
        documentId={documentId}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Estado" })).toHaveValue(
        "ready",
      ),
    );
  });

  it("only offers Listo for an indexed version and never preselects it disabled", () => {
    render(
      <DocumentTechnicalStatusForm
        approvalStatus="ready"
        approvedVersionId={approvedVersionId}
        currentIngestionStatus="processing"
        documentId={documentId}
      />,
    );

    expect(
      screen.getByRole("option", { name: "Listo (disponible para consultas)" }),
    ).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Estado" })).toHaveValue(
      "pending_approval",
    );
    expect(
      screen.getByText(/la versión debe estar indexada/),
    ).toBeInTheDocument();
  });

  it("confirms that a document sent back to processing is queued", () => {
    render(
      <DocumentTechnicalStatusForm
        approvalStatus="pending_approval"
        approvedVersionId={null}
        currentIngestionStatus="pending"
        documentId={documentId}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /en la cola de lectura e indexación/,
    );
  });
});
