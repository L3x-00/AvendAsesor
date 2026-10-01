import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SUCCESS_DIALOG_AUTO_CLOSE_MS,
  SuccessDialog,
} from "./success-dialog";

function Harness({
  autoCloseMs,
  returnFocusId,
}: {
  autoCloseMs?: number | null;
  returnFocusId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <h1 id="page-title" tabIndex={-1}>
        Título
      </h1>
      <button onClick={() => setOpen(true)} type="button">
        Abrir
      </button>
      {open ? (
        <SuccessDialog
          autoCloseMs={autoCloseMs}
          description="La consulta ya no aparece en tu historial."
          onClose={() => setOpen(false)}
          returnFocusId={returnFocusId}
          title="Historial quitado correctamente"
        />
      ) : null}
    </>
  );
}

function openDialog() {
  const opener = screen.getByRole("button", { name: "Abrir" });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe("SuccessDialog", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("es una ventana modal con título, descripción y el foco en «Aceptar»", () => {
    render(<Harness />);
    openDialog();

    const dialog = screen.getByRole("dialog", {
      name: "Historial quitado correctamente",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(
      "La consulta ya no aparece en tu historial.",
    );
    expect(screen.getByRole("button", { name: "Aceptar" })).toHaveFocus();
    // Mientras está abierta, la página de fondo no se desplaza.
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("«Aceptar» cierra y devuelve el foco a quien la abrió", () => {
    render(<Harness />);
    const opener = openDialog();

    fireEvent.click(screen.getByRole("button", { name: "Aceptar" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("Escape la cierra y Tab no sale de la ventana", () => {
    render(<Harness />);
    openDialog();
    const accept = screen.getByRole("button", { name: "Aceptar" });

    fireEvent.keyDown(document, { key: "Tab" });
    expect(accept).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(accept).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("un clic fuera de la ventana la cierra; dentro, no", () => {
    render(<Harness />);
    openDialog();

    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("success-dialog-overlay"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("se cierra sola a los ~4 s y se pausa con el puntero encima", () => {
    vi.useFakeTimers();
    render(<Harness />);
    openDialog();
    expect(SUCCESS_DIALOG_AUTO_CLOSE_MS).toBe(4000);

    fireEvent.mouseEnter(screen.getByRole("dialog"));
    act(() => {
      vi.advanceTimersByTime(SUCCESS_DIALOG_AUTO_CLOSE_MS + 1000);
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByRole("dialog"));
    act(() => {
      vi.advanceTimersByTime(SUCCESS_DIALOG_AUTO_CLOSE_MS - 1);
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sin cierre automático cuando se desactiva", () => {
    vi.useFakeTimers();
    render(<Harness autoCloseMs={null} />);
    openDialog();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("con movimiento reducido aparece sin animación y con el check ya dibujado", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/components/ui/success-dialog.module.css"),
      "utf8",
    );
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));

    expect(reduced).toMatch(/\.dialog,[\s\S]*?animation: none;/);
    expect(reduced).toMatch(/stroke-dashoffset: 0;/);
  });

  it("al cerrar prefiere el destino de foco indicado", () => {
    render(<Harness returnFocusId="page-title" />);
    openDialog();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.getByRole("heading", { name: "Título" })).toHaveFocus();
  });
});
