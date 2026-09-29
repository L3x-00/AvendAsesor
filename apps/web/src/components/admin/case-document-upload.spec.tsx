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
        initialModuleId="8c8b56af-6d0c-4fef-881e-7c00907540dd"
        initialSubmoduleId="9c8b56af-6d0c-4fef-881e-7c00907540dd"
        roots={[{ id: "8c8b56af-6d0c-4fef-881e-7c00907540dd", name: "Licencias", parentModuleId: null }]}
        submodules={[{ id: "9c8b56af-6d0c-4fef-881e-7c00907540dd", name: "Salud", parentModuleId: "8c8b56af-6d0c-4fef-881e-7c00907540dd" }]}
      />,
    );

    expect(screen.getByLabelText(/Título del documento/)).toHaveValue("");
    expect(screen.getByLabelText(/^Módulo$/)).toHaveValue("8c8b56af-6d0c-4fef-881e-7c00907540dd");
    expect(screen.getByLabelText(/^Submódulo$/)).toHaveValue("9c8b56af-6d0c-4fef-881e-7c00907540dd");
    expect(screen.getByLabelText(/Tipo de documento/)).toBeRequired();
    expect(screen.getByLabelText(/Entidad emisora/)).toBeRequired();
    expect(screen.getByLabelText(/Dependencia específica/)).toBeRequired();
    expect(screen.getByLabelText(/Año del documento/)).toBeRequired();
    expect(screen.getByLabelText(/Archivo/)).toBeRequired();
    expect(screen.getByText(/Se guardará en: Salud/)).toBeInTheDocument();

    const hiddenModule = document.querySelector(
      'input[name="moduleIds"]',
    ) as HTMLInputElement | null;
    expect(hiddenModule).toHaveValue('["9c8b56af-6d0c-4fef-881e-7c00907540dd"]');
  });
});
