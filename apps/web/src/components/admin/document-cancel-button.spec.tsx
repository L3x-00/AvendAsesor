import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentEditCancelButton } from "./document-edit-cancel-button";

describe("DocumentEditCancelButton", () => {
  it("renders the Cancelar button", () => {
    render(<DocumentEditCancelButton />);

    const button = screen.getByRole("button", { name: "Cancelar" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("type", "button");
  });

  it("closes the edit-document details when clicked", () => {
    const details = document.createElement("details");
    details.id = "edit-document";
    details.open = true;
    document.body.appendChild(details);

    render(<DocumentEditCancelButton />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(details.open).toBe(false);

    document.body.removeChild(details);
  });

  it("prevents the default action on click", () => {
    render(<DocumentEditCancelButton />);

    const button = screen.getByRole("button", { name: "Cancelar" });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");

    button.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it("does nothing when the edit-document details is not present", () => {
    render(<DocumentEditCancelButton />);

    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: "Cancelar" })),
    ).not.toThrow();
  });
});