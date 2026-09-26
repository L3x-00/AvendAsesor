import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeleteDisclosure } from "./delete-disclosure";

describe("DeleteDisclosure", () => {
  it("cerrado es solo un botón rojo; abierto explica, pide el motivo y permite cancelar", async () => {
    const user = userEvent.setup();
    render(
      <DeleteDisclosure
        description={<p>Se conserva el historial.</p>}
        title="¿Eliminar este documento?"
        triggerLabel="Eliminar documento"
      >
        {/* Como en los formularios reales, empieza con un campo oculto. */}
        <input name="documentId" type="hidden" value="d1" />
        <label>
          Motivo
          <input name="reason" />
        </label>
        <button type="submit">Sí, eliminar</button>
      </DeleteDisclosure>,
    );

    expect(screen.queryByLabelText("Motivo")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Eliminar documento" }));

    expect(screen.getByRole("group", { name: "¿Eliminar este documento?" })).toBeVisible();
    expect(screen.getByText("Se conserva el historial.")).toBeVisible();
    expect(screen.getByLabelText("Motivo")).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByLabelText("Motivo")).toBeNull();
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Eliminar documento" })).toHaveFocus(),
    );
  });

  it("Escape cierra la confirmación", async () => {
    const user = userEvent.setup();
    render(
      <DeleteDisclosure description="x" title="¿Quitar?" triggerLabel="Quitar asociación">
        <input name="moduleId" type="hidden" value="m1" />
        <button type="submit">Sí, quitar</button>
      </DeleteDisclosure>,
    );

    await user.click(screen.getByRole("button", { name: "Quitar asociación" }));
    expect(screen.getByRole("button", { name: "Sí, quitar" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Sí, quitar" })).toBeNull();
  });
});
