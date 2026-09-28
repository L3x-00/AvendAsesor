import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { CaseDocumentUpload } from "./case-document-upload";

vi.mock("@/app/admin/operations/consultation-actions", () => ({
  linkUploadedDocumentToCaseAction: vi.fn(),
}));

vi.mock("./document-pdf-upload-form", () => ({
  DocumentPdfUploadForm: ({ children }: { children: ReactNode }) => (
    <form>{children}</form>
  ),
}));

describe("CaseDocumentUpload", () => {
  it("asocia el documento al módulo del caso y pide los datos mínimos", () => {
    render(
      <CaseDocumentUpload
        apiBaseUrl="https://api.avend.example"
        caseId="4c8b56af-6d0c-4fef-881e-7c00907540dd"
        moduleId="8c8b56af-6d0c-4fef-881e-7c00907540dd"
        moduleLabel="Licencias › Salud"
        suggestedTitle="¿Cuánto dura la licencia?"
      />,
    );

    expect(screen.getByLabelText(/Título del documento/)).toHaveValue(
      "¿Cuánto dura la licencia?",
    );
    expect(screen.getByLabelText(/Tipo de documento/)).toBeRequired();
    expect(screen.getByLabelText(/Entidad emisora/)).toBeRequired();
    expect(screen.getByLabelText(/Año del documento/)).toBeRequired();
    expect(screen.getByLabelText(/Archivo/)).toBeRequired();
    expect(screen.getByText(/Licencias › Salud/)).toBeInTheDocument();

    const hiddenModule = document.querySelector(
      'input[name="moduleId"]',
    ) as HTMLInputElement | null;
    expect(hiddenModule).toHaveValue("8c8b56af-6d0c-4fef-881e-7c00907540dd");
  });
});
