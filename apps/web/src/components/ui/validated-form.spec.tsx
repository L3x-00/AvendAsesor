import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FieldError, FormField } from "./form-field";
import { ValidatedForm } from "./validated-form";
import type { FieldRules } from "@/lib/ui/field-validation";

const RULES: FieldRules = {
  email: [
    { kind: "required", label: "El correo electrónico" },
    { kind: "email", label: "El correo electrónico" },
  ],
  fullName: [{ kind: "required", label: "El nombre" }],
};

function renderForm(onValidSubmit = vi.fn()) {
  render(
    <ValidatedForm onValidSubmit={onValidSubmit} rules={RULES}>
      <FormField label="Nombre" name="fullName" required>
        <input className="avend-field" name="fullName" type="text" />
      </FormField>
      <FormField label="Correo electrónico" name="email" required>
        <input className="avend-field" name="email" type="text" />
      </FormField>
      <button type="submit">Guardar</button>
    </ValidatedForm>,
  );

  return { onValidSubmit };
}

describe("ValidatedForm", () => {
  it("marks every failing field, not only the first, and blocks the submit", async () => {
    const user = userEvent.setup();
    const { onValidSubmit } = renderForm();

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(onValidSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("El nombre es obligatorio.")).toBeVisible();
    expect(
      screen.getByText("El correo electrónico es obligatorio."),
    ).toBeVisible();
    expect(screen.getByLabelText("Nombre")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Correo electrónico")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("clears the error of a field as soon as it becomes valid, and only that one", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await user.type(screen.getByLabelText("Nombre"), "Ana Quispe");

    await waitFor(() => {
      expect(
        screen.queryByText("El nombre es obligatorio."),
      ).not.toBeInTheDocument();
    });
    // El otro campo sigue señalado: corregir uno no borra el resto.
    expect(
      screen.getByText("El correo electrónico es obligatorio."),
    ).toBeVisible();
  });

  it("keeps the error while the correction is still invalid", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await user.type(screen.getByLabelText("Correo electrónico"), "todavia-no");

    expect(
      screen.getByText("El correo electrónico es obligatorio."),
    ).toBeVisible();
  });

  it("hands over the data once every field is valid", async () => {
    const user = userEvent.setup();
    const { onValidSubmit } = renderForm();

    await user.type(screen.getByLabelText("Nombre"), "Ana Quispe");
    await user.type(
      screen.getByLabelText("Correo electrónico"),
      "ana@avend.pe",
    );
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(onValidSubmit).toHaveBeenCalledTimes(1);
    const [formData] = onValidSubmit.mock.calls[0] as [FormData];
    expect(formData.get("email")).toBe("ana@avend.pe");
  });

  /**
   * Los atributos nativos siguen valiendo aunque el campo no declare regla:
   * el formulario lleva `noValidate` solo para sustituir los globos del
   * navegador por mensajes propios.
   */
  it("still honours a native constraint on a field without declared rules", async () => {
    const user = userEvent.setup();
    const onValidSubmit = vi.fn();

    render(
      <ValidatedForm onValidSubmit={onValidSubmit} rules={{}}>
        <label htmlFor="code">Código</label>
        <input id="code" name="code" required />
        <button type="submit">Guardar</button>
      </ValidatedForm>,
    );

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(onValidSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Código")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("shows the errors the server attributes to a field", () => {
    render(
      <ValidatedForm
        rules={RULES}
        serverErrors={{ email: "Ese correo ya tiene una cuenta." }}
      >
        <FormField label="Correo electrónico" name="email">
          <input className="avend-field" name="email" type="text" />
        </FormField>
        <button type="submit">Guardar</button>
      </ValidatedForm>,
    );

    expect(screen.getByText("Ese correo ya tiene una cuenta.")).toBeVisible();
  });

  it("lets a field publish its message outside FormField", async () => {
    const user = userEvent.setup();

    render(
      <ValidatedForm
        onValidSubmit={vi.fn()}
        rules={{ code: [{ kind: "required", label: "El código" }] }}
      >
        <label htmlFor="code">Código</label>
        <input id="code" name="code" />
        <FieldError name="code" />
        <button type="submit">Guardar</button>
      </ValidatedForm>,
    );

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByText("El código es obligatorio.")).toBeVisible();
  });
});

describe("FormField", () => {
  it("links label, hint and error so a screen reader reads them with the field", () => {
    render(
      <ValidatedForm rules={{}} serverErrors={{ phone: "Revisa el celular." }}>
        <FormField hint="Solo dígitos." label="Celular" name="phone">
          <input className="avend-field" name="phone" />
        </FormField>
      </ValidatedForm>,
    );

    const field = screen.getByLabelText("Celular");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field.getAttribute("aria-describedby")).toContain("phone-error");
    expect(field.getAttribute("aria-describedby")).toContain("phone-hint");
  });
});
