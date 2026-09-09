import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useActionState, useState } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FieldError, FormField, FormFieldGroup } from "./form-field";
import { formDataFromForm, ValidatedForm } from "./validated-form";
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
      screen.getByText("El correo electrónico no es válido."),
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

  it("focuses the first failing control in DOM order and opens its details", async () => {
    const user = userEvent.setup();
    render(
      <ValidatedForm onValidSubmit={vi.fn()} rules={RULES}>
        <details>
          <summary>Datos del usuario</summary>
          <FormField label="Nombre" name="fullName"><input name="fullName" /></FormField>
        </details>
        <FormField label="Correo" name="email"><input name="email" /></FormField>
        <button type="submit">Guardar</button>
      </ValidatedForm>,
    );
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByLabelText("Nombre")).toHaveFocus());
    expect(screen.getByText("Datos del usuario").closest("details")).toHaveAttribute("open");
    expect(screen.getAllByText(/es obligatorio/)).toHaveLength(2);
  });

  it("revalidates a previously valid date when its start date changes", async () => {
    const user = userEvent.setup();
    render(
      <ValidatedForm onValidSubmit={vi.fn()} rules={{
        end: [{ kind: "dateOrder", label: "La fecha de fin", startField: "start", startLabel: "La fecha de inicio" }],
      }}>
        <FormField label="Inicio" name="start"><input defaultValue="2026-01-01" name="start" type="date" /></FormField>
        <FormField label="Fin" name="end"><input defaultValue="2026-01-02" name="end" type="date" /></FormField>
        <button type="submit">Guardar</button>
      </ValidatedForm>,
    );
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    fireEvent.change(screen.getByLabelText("Inicio"), { target: { value: "2026-02-01" } });
    expect(await screen.findByText(/igual o posterior/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Inicio"), { target: { value: "2026-01-02" } });
    await waitFor(() => expect(screen.queryByText(/igual o posterior/)).toBeNull());
  });

  it("updates requiredWhen and native conditional fields after the controlling selection", async () => {
    const user = userEvent.setup();
    function ConditionalForm() {
      const [hasDate, setHasDate] = useState(false);
      return (
        <ValidatedForm onValidSubmit={vi.fn()} rules={{
          reason: [{ kind: "requiredWhen", field: "mode", value: "other", label: "El motivo" }],
          ...(!hasDate ? { year: [{ kind: "required" as const, label: "El año o la fecha" }] } : {}),
        }}>
          <FormField label="Modo" name="mode"><select defaultValue="normal" name="mode"><option value="normal">Normal</option><option value="other">Otro</option></select></FormField>
          <FormField label="Motivo" name="reason"><input name="reason" /></FormField>
          <FormField label="Fecha" name="date"><input name="date" type="date" onChange={(event) => setHasDate(Boolean(event.target.value))} /></FormField>
          <FormField label="Año" name="year"><input name="year" required={!hasDate} /></FormField>
          <button type="submit">Guardar</button>
        </ValidatedForm>
      );
    }
    render(<ConditionalForm />);
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByText("El año o la fecha es obligatorio.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-01-02" } });
    await waitFor(() => expect(screen.getByLabelText("Año")).not.toHaveAttribute("aria-invalid"));
    await user.selectOptions(screen.getByLabelText("Modo"), "other");
    expect(await screen.findByText("El motivo es obligatorio.")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Modo"), "normal");
    await waitFor(() => expect(screen.queryByText("El motivo es obligatorio.")).toBeNull());
  });

  it("preserves field-level server errors when an unrelated field changes", async () => {
    const user = userEvent.setup();
    render(
      <ValidatedForm rules={RULES} serverErrors={{ email: "Ese correo ya tiene una cuenta." }}>
        <FormField label="Correo" name="email"><input defaultValue="existente@avend.pe" name="email" /></FormField>
        <FormField label="Nombre" name="fullName"><input name="fullName" /></FormField>
      </ValidatedForm>,
    );
    await user.type(screen.getByLabelText("Nombre"), "Ana");
    expect(screen.getByText("Ese correo ya tiene una cuenta.")).toBeVisible();
    await user.type(screen.getByLabelText("Correo"), "u");
    await waitFor(() => expect(screen.queryByText("Ese correo ya tiene una cuenta.")).toBeNull());
  });

  it("validates every selected file and retains the actual File objects", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onValidSubmit = vi.fn();
    render(
      <ValidatedForm onValidSubmit={onValidSubmit} rules={{ files: [
        { kind: "required", label: "El archivo" },
        { kind: "file", accept: [".pdf"], label: "El archivo", maxBytes: 1024 },
      ] }}>
        <FormField label="Archivos" name="files"><input name="files" type="file" required multiple accept=".pdf" /></FormField>
        <button type="submit">Guardar</button>
      </ValidatedForm>,
    );
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    const invalid = new File(["bad"], "nota.txt", { type: "text/plain" });
    const valid = new File(["%PDF"], "norma.pdf", { type: "application/pdf" });
    const input = screen.getByLabelText("Archivos") as HTMLInputElement;
    await user.upload(input, [invalid, valid]);
    expect(await screen.findByText("El archivo debe ser un PDF válido.")).toBeVisible();
    expect(formDataFromForm(input.form!).getAll("files")).toEqual([invalid, valid]);
    await user.upload(input, [valid]);
    await waitFor(() => expect(input).not.toHaveAttribute("aria-invalid"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onValidSubmit).toHaveBeenCalledTimes(1);
    expect(onValidSubmit.mock.calls[0][0].get("files")).toBe(valid);
  });

  it("retains values on a failed React action and permits reset on success", async () => {
    const user = userEvent.setup();
    const action = vi.fn()
      .mockResolvedValueOnce({ status: "error", message: "No se pudo guardar." })
      .mockResolvedValueOnce({ status: "success" });
    function ActionForm() {
      const [state, formAction] = useActionState(action, { status: "idle" });
      return (
        <ValidatedForm action={formAction} rules={{}} submissionState={state}>
          <FormField label="Nombre" name="fullName"><input name="fullName" /></FormField>
          <button type="submit">Guardar</button>
          {state.message ? <p role="alert">{state.message}</p> : null}
        </ValidatedForm>
      );
    }
    render(<ActionForm />);
    await user.type(screen.getByLabelText("Nombre"), "Ana Quispe");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar.");
    expect(screen.getByLabelText("Nombre")).toHaveValue("Ana Quispe");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByLabelText("Nombre")).toHaveValue(""));
    expect(action).toHaveBeenCalledTimes(2);
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

  it("uses unique IDs in repeated forms and respects an explicit child ID and description", () => {
    render(<>
      {["Primero", "Segundo"].map((label, index) => (
        <ValidatedForm key={label} rules={{}} serverErrors={{ email: "Correo inválido." }}>
          <p id={`external-${index}`}>Ayuda externa {index}</p>
          <FormField label={label} name="email" hint="Usa tu correo.">
            <input id={`custom-${index}`} name="email" aria-describedby={`external-${index}`} />
          </FormField>
        </ValidatedForm>
      ))}
    </>);
    const first = screen.getByLabelText("Primero");
    const second = screen.getByLabelText("Segundo");
    expect(first).toHaveAttribute("id", "custom-0");
    expect(second).toHaveAttribute("id", "custom-1");
    expect(first).toHaveAttribute("aria-describedby", expect.stringContaining("external-0"));
    const messages = screen.getAllByText("Correo inválido.").map((node) => node.closest("p")!);
    expect(new Set(messages.map((node) => node.id)).size).toBe(2);
    expect(first).toHaveAttribute("aria-describedby", expect.stringContaining(messages[0].id));
    expect(within(first.closest("form")!).getAllByText("Correo inválido.")).toHaveLength(1);
  });

  it("connects radio-group errors to the group and controls without duplicate messages", async () => {
    const user = userEvent.setup();
    render(<ValidatedForm onValidSubmit={vi.fn()} rules={{ choice: [{ kind: "required", label: "La opción" }] }}>
      <FormFieldGroup label="Opciones" name="choice" hint="Elige una opción.">
        <label><input name="choice" type="radio" value="one" />Primera</label>
        <label><input name="choice" type="radio" value="two" />Segunda</label>
      </FormFieldGroup>
      <button type="submit">Guardar</button>
    </ValidatedForm>);
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getAllByText("La opción es obligatorio.")).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Opciones" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Primera")).toHaveAccessibleDescription("La opción es obligatorio.");
    await user.click(screen.getByLabelText("Segunda"));
    await waitFor(() => expect(screen.queryByText("La opción es obligatorio.")).toBeNull());
  });
});
