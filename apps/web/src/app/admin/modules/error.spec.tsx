import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AdminError from "../error";
import ModulesError from "./error";

describe("pantallas de error de Módulos", () => {
  it("vuelve a pedir los datos al pulsar Reintentar y no niega un guardado previo", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<ModulesError retry={retry} />);

    const alert = screen.getByRole("alert");
    expect(alert).not.toHaveTextContent(/Ningún cambio fue aplicado/);
    expect(alert).not.toHaveTextContent(/Revisa tu conexión/);
    expect(alert).toHaveTextContent(/es posible que\s+ya se haya guardado/);

    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("el error general del panel también vuelve a pedir los datos", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<AdminError error={new Error("x")} retry={retry} />);

    await user.click(screen.getByRole("button", { name: "Actualizar vista" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
