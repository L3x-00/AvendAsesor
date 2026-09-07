import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./toast";

function Trigger({ message, tone }: { message: string; tone?: "error" | "success" }) {
  const { showToast } = useToast();
  return (
    <button onClick={() => showToast(message, tone)} type="button">
      Guardar
    </button>
  );
}

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("confirms the action and withdraws on its own", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ToastProvider>
        <Trigger message="Guardado con éxito." />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByText("Guardado con éxito.")).toBeVisible();

    // Se retira sin que nadie lo cierre: confirmar no debe costar un clic.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText("Guardado con éxito.")).not.toBeInTheDocument();
  });

  it("can be dismissed before its time is up", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ToastProvider>
        <Trigger message="Registro exitoso." />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await user.click(screen.getByRole("button", { name: "Cerrar aviso" }));

    expect(screen.queryByText("Registro exitoso.")).not.toBeInTheDocument();
  });

  it("stacks several confirmations instead of replacing the previous one", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ToastProvider>
        <Trigger message="Primero." />
        <Trigger message="Segundo." tone="error" />
      </ToastProvider>,
    );

    const [first, second] = screen.getAllByRole("button", { name: "Guardar" });
    await user.click(first);
    await user.click(second);

    expect(screen.getByText("Primero.")).toBeVisible();
    expect(screen.getByText("Segundo.")).toBeVisible();
  });

  it("ignores an empty message so no blank box appears", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ToastProvider>
        <Trigger message="   " />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.queryByRole("button", { name: "Cerrar aviso" })).toBeNull();
  });

  /**
   * Un formulario colocado fuera del proveedor tiene que seguir guardando:
   * perder el aviso es preferible a romper el envío.
   */
  it("does nothing instead of throwing when there is no provider", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<Trigger message="Sin proveedor." />);

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.queryByText("Sin proveedor.")).not.toBeInTheDocument();
  });
});
