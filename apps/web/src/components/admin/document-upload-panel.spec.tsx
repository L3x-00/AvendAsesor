import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentUploadPanel } from "./document-upload-panel";

vi.mock("./document-pdf-upload-form", () => ({
  DocumentPdfUploadForm: ({ children }: { children: React.ReactNode }) => (
    <form>{children}</form>
  ),
}));

vi.mock("./document-metadata-fields", () => ({
  DocumentMetadataFields: () => <div data-testid="metadata-fields" />,
}));

vi.mock("@/components/ui/form-field", () => ({
  FieldError: () => null,
}));

const baseProps = {
  apiBaseUrl: "http://localhost:3000",
  moduleId: "mod-123",
  moduleName: "Evaluación docente",
  replacementCandidates: [],
  suggestions: { additionalDetails: [], specificDependencies: [] },
};

describe("DocumentUploadPanel", () => {
  it("renders the collapsed state by default with the module name", () => {
    render(<DocumentUploadPanel {...baseProps} />);

    const toggle = screen.getByRole("button", { name: /agregar documento/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(/Evaluación docente/)).toBeInTheDocument();
  });

  it("expands the form when the toggle is clicked", () => {
    render(<DocumentUploadPanel {...baseProps} />);

    const toggle = screen.getByRole("button", { name: /agregar documento/i });
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("collapses the form on a second click", () => {
    render(<DocumentUploadPanel {...baseProps} />);

    const toggle = screen.getByRole("button", { name: /agregar documento/i });
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});