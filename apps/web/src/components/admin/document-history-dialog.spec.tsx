import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DocumentHistoryDialog } from "./document-history-dialog";

describe("DocumentHistoryDialog", () => {
  it("abre el historial como diálogo y devuelve el foco al cerrarlo", async () => {
    const user = userEvent.setup();
    render(
      <DocumentHistoryDialog documentTitle="Norma de prueba">
        <p>Registro de versiones</p>
      </DocumentHistoryDialog>,
    );

    const trigger = screen.getByRole("button", { name: "Ver historial" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", {
      name: "Historial del documento",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(dialog).toHaveTextContent("Registro de versiones");

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Historial del documento" }),
      ).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });
});
