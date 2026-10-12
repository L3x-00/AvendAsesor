import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteDocumentAction,
  setDocumentTechnicalStatusAction,
} from "@/app/admin/actions";
import type { DocumentLibraryItem } from "@/lib/admin-api/types";
import { DocumentRowActions } from "./document-row-actions";

vi.mock("@/app/admin/actions", () => ({
  deleteDocumentAction: vi.fn(async () => ({
    message: "Documento eliminado lógicamente.",
    status: "success",
  })),
  setDocumentTechnicalStatusAction: vi.fn(async () => ({
    message: "Estado técnico actualizado.",
    status: "success",
  })),
}));

const documentId = "680a1b3e-9a76-46b9-9130-7284e03aa123";
const versionId = "f84e1198-6c7d-4fa2-998e-2dced81389d8";

const document: DocumentLibraryItem = {
  additionalDetail: null,
  articleReference: null,
  createdAt: "2026-09-01T15:00:00.000Z",
  createdBy: null,
  createdByName: "Ana Administradora",
  currentVersionId: versionId,
  currentVersionUploadedAt: "2026-09-01T15:00:00.000Z",
  documentType: "RESOLUCION_MINISTERIAL",
  documentTypeOther: null,
  id: documentId,
  issuanceYear: 2026,
  issuingEntity: "Minedu",
  issuingEntityOther: null,
  keywords: null,
  metadata: {},
  moduleAssociations: [],
  publicationStatus: "active",
  replacementDate: null,
  replacementDocumentId: null,
  replacementObservation: null,
  replacementReason: null,
  replacementYear: null,
  resolutionNumber: "RM-100-2026",
  situation: "current",
  specificDependency: "Secretaría General",
  technicalStatus: "pending_approval",
  title: "Nombramiento docente 2026",
  updatedAt: "2026-09-01T15:00:00.000Z",
  updatedBy: null,
};

describe("DocumentRowActions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("solo ofrece Marcar como Listo mientras el estado técnico está pendiente", () => {
    const { rerender } = render(<DocumentRowActions document={document} />);

    expect(
      screen.getByRole("button", {
        name: `Marcar como Listo: ${document.title}`,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: `Eliminar: ${document.title}` }),
    ).toBeVisible();

    rerender(
      <DocumentRowActions
        document={{ ...document, technicalStatus: "ready" }}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /^Marcar como Listo: / }),
    ).toBeNull();
  });

  it("elimina con el mismo flujo de la ficha: diálogo, motivo obligatorio y acción", async () => {
    const user = userEvent.setup();
    render(<DocumentRowActions document={document} />);

    await user.click(
      screen.getByRole("button", { name: `Eliminar: ${document.title}` }),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "¿Eliminar este documento?",
    );

    // Sin motivo no se envía: el error se marca en el campo.
    await user.click(
      screen.getByRole("button", { name: "Sí, eliminar documento" }),
    );
    expect(deleteDocumentAction).not.toHaveBeenCalled();
    expect(
      screen.getByText("El motivo es obligatorio."),
    ).toBeInTheDocument();

    // Un motivo de un solo carácter tampoco basta (misma regla que la ficha).
    await user.type(screen.getByLabelText("Motivo"), "D");
    await user.click(
      screen.getByRole("button", { name: "Sí, eliminar documento" }),
    );
    expect(deleteDocumentAction).not.toHaveBeenCalled();
    expect(
      screen.getByText("El motivo debe tener al menos 2 caracteres."),
    ).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Motivo"));
    await user.type(screen.getByLabelText("Motivo"), "Duplicado");
    await user.click(
      screen.getByRole("button", { name: "Sí, eliminar documento" }),
    );

    await waitFor(() => expect(deleteDocumentAction).toHaveBeenCalled());
    const [, formData] = vi.mocked(deleteDocumentAction).mock.calls[0] ?? [];
    expect((formData as FormData).get("documentId")).toBe(documentId);
    expect((formData as FormData).get("reason")).toBe("Duplicado");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("marca como Listo enviando el estado técnico ready", async () => {
    const user = userEvent.setup();
    render(<DocumentRowActions document={document} />);

    await user.click(
      screen.getByRole("button", {
        name: `Marcar como Listo: ${document.title}`,
      }),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Marcar como Listo");

    await user.click(
      screen.getByRole("button", { name: "Sí, marcar como Listo" }),
    );

    await waitFor(() =>
      expect(setDocumentTechnicalStatusAction).toHaveBeenCalled(),
    );
    const [, formData] =
      vi.mocked(setDocumentTechnicalStatusAction).mock.calls[0] ?? [];
    expect((formData as FormData).get("documentId")).toBe(documentId);
    expect((formData as FormData).get("technicalStatus")).toBe("ready");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
