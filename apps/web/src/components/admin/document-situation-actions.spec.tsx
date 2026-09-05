import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDocumentSituationAction } from "@/app/admin/actions";
import { ARCHIVE_REASON_OPTIONS } from "@/lib/admin-api/document-taxonomy";
import { DocumentSituationActions } from "./document-situation-actions";

vi.mock("@/app/admin/actions", () => ({
  setDocumentSituationAction: vi.fn(async () => ({ status: "idle" })),
}));

const replacementCandidates = [
  { id: "510ca0c0-b3b0-46f1-881d-730e6398075d", title: "Norma vigente 2026" },
];

describe("DocumentSituationActions", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("requires a reason before archival and exposes every requested reason", async () => {
    const user = userEvent.setup();
    render(
      <DocumentSituationActions
        documentId="d60530ac-6fba-46bd-bac7-940c0655db54"
        replacementCandidates={replacementCandidates}
        situation="current"
      />,
    );

    await user.click(screen.getByText("Archivar / Desactivar"));
    const reason = screen.getByRole("combobox", { name: "Motivo" });
    expect(screen.getAllByRole("option", { hidden: true })).toHaveLength(
      ARCHIVE_REASON_OPTIONS.length,
    );
    expect(reason).toHaveValue("NOT_APPLICABLE");
    expect(
      screen.queryByRole("combobox", { name: /Documento que lo reemplaza/ }),
    ).toBeNull();
  });

  it("shows replacement linkage only for the replacement reason", async () => {
    const user = userEvent.setup();
    render(
      <DocumentSituationActions
        documentId="d60530ac-6fba-46bd-bac7-940c0655db54"
        replacementCandidates={replacementCandidates}
        situation="current"
      />,
    );

    await user.click(screen.getByText("Archivar / Desactivar"));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Motivo" }),
      "REPLACED_BY_NEWER",
    );
    expect(
      screen.getByRole("combobox", { name: /Documento que lo reemplaza/ }),
    ).toHaveValue("");
    expect(
      screen.getByRole("spinbutton", { name: "Año del reemplazo" }),
    ).toBeRequired();
    expect(
      screen.getByRole("textbox", { name: "Motivo del cambio" }),
    ).toBeRequired();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Motivo" }),
      "DUPLICATE",
    );
    expect(
      screen.queryByRole("combobox", { name: /Documento que lo reemplaza/ }),
    ).toBeNull();
    expect(
      screen.getByRole("textbox", { name: /Observación adicional/ }),
    ).not.toBeRequired();
  });

  it("shows a manual reason for Otro and allows restoring historical records", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <DocumentSituationActions
        documentId="d60530ac-6fba-46bd-bac7-940c0655db54"
        replacementCandidates={replacementCandidates}
        situation="current"
      />,
    );

    await user.click(screen.getByText("Archivar / Desactivar"));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Motivo" }),
      "OTHER",
    );
    expect(
      screen.getByRole("textbox", { name: "Especificar motivo" }),
    ).toBeRequired();

    rerender(
      <DocumentSituationActions
        documentId="d60530ac-6fba-46bd-bac7-940c0655db54"
        replacementCandidates={replacementCandidates}
        situation="archived"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Marcar como vigente" }),
    ).toBeVisible();
  });

  it("archives a replaced document directly without restoring it or requiring another replacement", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <DocumentSituationActions
        documentId="d60530ac-6fba-46bd-bac7-940c0655db54"
        replacementCandidates={replacementCandidates}
        situation="replaced"
      />,
    );

    await user.click(
      screen.getByText("Archivar documento", { selector: "summary" }),
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Motivo" }),
      "DUPLICATE",
    );
    expect(
      screen.queryByRole("option", { name: /Reemplazado por/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("combobox", { name: /Documento que lo reemplaza/ }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Archivar documento" }),
    );

    await waitFor(() =>
      expect(setDocumentSituationAction).toHaveBeenCalledTimes(1),
    );
    const submitted = vi.mocked(setDocumentSituationAction).mock.calls[0][1];
    expect(submitted.get("situation")).toBe("archived");
    expect(submitted.get("archiveReasonCode")).toBe("DUPLICATE");
    expect(submitted.has("replacementDocumentId")).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("registers replacement of an archived document directly with date or year and confirmation", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <DocumentSituationActions
        documentId="d60530ac-6fba-46bd-bac7-940c0655db54"
        replacementCandidates={replacementCandidates}
        situation="archived"
      />,
    );

    await user.click(
      screen.getByText("Registrar reemplazo", { selector: "summary" }),
    );
    expect(screen.getByRole("combobox", { name: "Motivo" })).toHaveValue(
      "REPLACED_BY_NEWER",
    );
    expect(
      screen.queryByRole("option", { name: "Documento duplicado" }),
    ).toBeNull();
    await user.selectOptions(
      screen.getByRole("combobox", { name: /Documento que lo reemplaza/ }),
      replacementCandidates[0].id,
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "Año del reemplazo" }),
      "2026",
    );
    expect(screen.getByLabelText("Fecha del reemplazo")).not.toBeRequired();
    await user.type(
      screen.getByRole("textbox", { name: "Motivo del cambio" }),
      "Nueva norma registrada",
    );
    await user.click(
      screen.getByRole("button", { name: "Registrar reemplazo" }),
    );

    await waitFor(() =>
      expect(setDocumentSituationAction).toHaveBeenCalledTimes(1),
    );
    const submitted = vi.mocked(setDocumentSituationAction).mock.calls[0][1];
    expect(submitted.get("situation")).toBe("archived");
    expect(submitted.get("archiveReasonCode")).toBe("REPLACED_BY_NEWER");
    expect(submitted.get("replacementDocumentId")).toBe(
      replacementCandidates[0].id,
    );
    expect(submitted.get("replacementYear")).toBe("2026");
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
