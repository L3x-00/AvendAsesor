import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveProfileAction } from "@/app/(teacher)/profile/actions";
import type { ProfileActionState } from "@/app/(teacher)/profile/profile-form-state";
import { ProfileForms } from "./profile-forms";

const mocks = vi.hoisted(() => ({
  showToast: vi.fn(),
  states: { email: null as unknown, profile: null as unknown },
}));

vi.mock("@/app/(teacher)/profile/actions", () => ({
  changeProfileEmailAction: vi.fn(),
  saveProfileAction: vi.fn(),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

// Permite fijar el resultado de cada acción sin ejecutar un envío real. El
// hook original se llama siempre para no alterar el orden de los hooks.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useActionState: (action: never, initial: never) => {
      const real = actual.useActionState(action, initial);
      const override = action === saveProfileAction ? mocks.states.profile : mocks.states.email;
      return override ? [override, real[1], false] : real;
    },
  };
});

const baseProps = {
  city: "Huancayo",
  department: "Junín",
  email: "rosa@avend.test",
  fullName: "Rosa Docente",
  phone: "987654321",
} as const;

const saved: ProfileActionState = {
  message: "Tus datos se guardaron correctamente.",
  status: "success",
};

describe("ProfileForms", () => {
  beforeEach(() => {
    mocks.showToast.mockReset();
    mocks.states.email = null;
    mocks.states.profile = null;
  });

  it("muestra los datos del docente con los opcionales rotulados", () => {
    render(<ProfileForms {...baseProps} role="docente" />);

    expect(screen.getByRole("heading", { name: "Tus datos" })).toBeVisible();
    expect(screen.getByLabelText("Nombre completo")).toHaveValue("Rosa Docente");
    expect(screen.getByLabelText("Celular (opcional)")).toHaveValue("987654321");
    expect(screen.getByLabelText("Departamento (opcional)")).toHaveValue("Junín");
    expect(screen.getByLabelText("Ciudad (opcional)")).toHaveValue("Huancayo");
    expect(screen.getByText(/campos marcados con \* son obligatorios/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeVisible();
  });

  it("ofrece los departamentos del Perú y conserva un valor anterior fuera de la lista", () => {
    render(<ProfileForms {...baseProps} department="Lima Metropolitana" role="docente" />);

    expect(screen.getByLabelText("Departamento (opcional)")).toHaveValue("Lima Metropolitana");
    expect(screen.getByRole("option", { name: "Sin especificar" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Cusco" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Callao" })).toBeInTheDocument();
  });

  it.each(["admin", "superadmin"] as const)(
    "%s ve su nombre como solo lectura y no lo envía al guardar",
    (role) => {
      const { container } = render(<ProfileForms {...baseProps} fullName="Ana Pérez" role={role} />);

      expect(screen.queryByLabelText("Nombre completo")).not.toBeInTheDocument();
      expect(container.querySelector('[name="fullName"]')).toBeNull();
      expect(screen.getByText("Ana Pérez")).toBeVisible();
      expect(screen.getByText(/el nombre lo gestiona la administración/i)).toBeVisible();
      // Sí pueden editar sus datos de contacto.
      expect(screen.getByLabelText("Celular (opcional)")).toBeEnabled();
      expect(screen.getByLabelText("Departamento (opcional)")).toBeEnabled();
      expect(screen.getByLabelText("Ciudad (opcional)")).toBeEnabled();
    },
  );

  it("explica antes de enviar los dos enlaces y la salida sin acceso al correo actual", () => {
    render(<ProfileForms {...baseProps} role="docente" />);

    expect(screen.getByRole("heading", { name: "Correo electrónico" })).toBeVisible();
    expect(screen.getByText("rosa@avend.test")).toBeVisible();
    expect(screen.getByText(/uno a tu correo actual y otro al correo nuevo/i)).toBeVisible();
    expect(screen.getByText(/mismo navegador y no cierres sesión/i)).toBeVisible();
    expect(
      screen.getByText(/ya no tienes acceso a tu correo actual, pide el cambio a la administración/i),
    ).toBeVisible();
    // El campo es para el correo NUEVO: no repite el actual.
    expect(screen.getByLabelText("Correo nuevo")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Actualizar correo" })).toBeVisible();
  });

  it("muestra el cambio de correo pendiente de confirmar", () => {
    render(<ProfileForms {...baseProps} pendingEmail="nuevo@avend.test" role="docente" />);

    expect(screen.getByText(/cambio pendiente/i)).toBeVisible();
    expect(screen.getByText("nuevo@avend.test")).toBeVisible();
  });

  it("anuncia el guardado una sola vez", () => {
    const { rerender } = render(<ProfileForms {...baseProps} role="docente" />);

    mocks.states.profile = saved;
    rerender(<ProfileForms {...baseProps} role="docente" />);
    rerender(<ProfileForms {...baseProps} role="docente" />);

    expect(mocks.showToast).toHaveBeenCalledTimes(1);
    expect(mocks.showToast).toHaveBeenCalledWith("Tus datos se guardaron correctamente.");
  });

  it("al guardar los datos avisa si quedó un correo escrito sin enviar", () => {
    const { rerender } = render(<ProfileForms {...baseProps} role="docente" />);
    fireEvent.change(screen.getByLabelText("Correo nuevo"), {
      target: { value: "nuevo@avend.test" },
    });

    mocks.states.profile = saved;
    rerender(<ProfileForms {...baseProps} role="docente" />);

    expect(mocks.showToast).toHaveBeenCalledWith(
      expect.stringMatching(/tu correo no cambió.*actualizar correo/i),
    );
  });

  it("el éxito del correo se anuncia en línea, sin un segundo aviso emergente", () => {
    mocks.states.email = {
      message: "Listo. Enviamos un enlace a tu correo actual y otro a nuevo@avend.test.",
      status: "success",
    } satisfies ProfileActionState;

    render(<ProfileForms {...baseProps} role="docente" />);

    expect(screen.getByRole("status")).toHaveTextContent(/enviamos un enlace/i);
    expect(mocks.showToast).not.toHaveBeenCalled();
  });
});
