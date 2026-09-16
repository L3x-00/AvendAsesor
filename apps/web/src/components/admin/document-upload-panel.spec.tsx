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

  it("renders the file input with the correct accept attribute", () => {
    render(<DocumentUploadPanel {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /agregar documento/i }));

    const fileInput = screen.getByLabelText(/archivo/i) as HTMLInputElement;
    expect(fileInput).toHaveAttribute("type", "file");
    expect(fileInput).toHaveAttribute("name", "file");
    expect(fileInput).toHaveAttribute("required");
    expect(fileInput.accept).toContain(".pdf");
    expect(fileInput.accept).toContain(".docx");
    expect(fileInput.accept).toContain(".md");
  });

  it("renders the title field with correct constraints", () => {
    render(<DocumentUploadPanel {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /agregar documento/i }));

    const titleInput = screen.getByLabelText(/título/i) as HTMLInputElement;
    expect(titleInput).toHaveAttribute("name", "title");
    expect(titleInput).toHaveAttribute("required");
    expect(titleInput).toHaveAttribute("maxLength", "500");
    expect(titleInput).toHaveAttribute("minLength", "2");
  });

  it("renders the module id as a hidden input", () => {
    render(<DocumentUploadPanel {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /agregar documento/i }));

    const hiddenInput = document.querySelector(
      'input[name="moduleId"]',
    ) as HTMLInputElement;
    expect(hiddenInput).toBeInTheDocument();
    expect(hiddenInput).toHaveAttribute("type", "hidden");
    expect(hiddenInput).toHaveValue("mod-123");
  });
});