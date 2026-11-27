import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CLOSE_DOCUMENT_EDIT_EVENT } from "./document-edit-section";
import { DocumentEditCancelButton } from "./document-edit-cancel-button";

describe("DocumentEditCancelButton", () => {
  it("renders the Cancelar button", () => {
    render(<DocumentEditCancelButton />);

    const button = screen.getByRole("button", { name: "Cancelar" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("type", "button");
  });

  it("pide cerrar el diálogo de edición al hacer clic", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    window.addEventListener(CLOSE_DOCUMENT_EDIT_EVENT, onClose);
    render(<DocumentEditCancelButton />);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    window.removeEventListener(CLOSE_DOCUMENT_EDIT_EVENT, onClose);
  });
});
