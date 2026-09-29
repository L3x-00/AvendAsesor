import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProfileForms } from "./profile-forms";

vi.mock("@/app/(teacher)/profile/actions", () => ({
  changeProfileEmailAction: vi.fn(),
  initialProfileActionState: { status: "idle" },
  saveProfileAction: vi.fn(),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

describe("ProfileForms", () => {
  it("shows editable personal data and a separate email flow", () => {
    render(
      <ProfileForms
        city="Huancayo"
        department="Junín"
        email="rosa@avend.test"
        fullName="Rosa Docente"
        phone="987654321"
      />,
    );

    expect(screen.getByRole("heading", { name: "Tus datos" })).toBeVisible();
    expect(screen.getByLabelText("Nombre completo")).toHaveValue("Rosa Docente");
    expect(screen.getByLabelText("Teléfono")).toHaveValue("987654321");
    expect(screen.getByLabelText("Departamento")).toHaveValue("Junín");
    expect(screen.getByLabelText("Ciudad")).toHaveValue("Huancayo");
    expect(screen.getByRole("heading", { name: "Correo electrónico" })).toBeVisible();
    expect(screen.getByLabelText("Correo de acceso")).toHaveValue("rosa@avend.test");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Actualizar correo" })).toBeVisible();
  });
});
