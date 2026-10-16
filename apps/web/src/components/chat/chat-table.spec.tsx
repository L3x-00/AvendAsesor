import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatTable, tableSummary } from "./chat-table";

const HINT = "Desliza hacia los lados para ver todas las columnas.";

function renderTable(overrides: Partial<Parameters<typeof ChatTable>[0]> = {}) {
  return render(
    <ChatTable
      headers={["Cargo", "Remuneración mensual"]}
      index={1}
      renderCell={(text) => text}
      rows={[
        ["Docente coordinador", "S/ 2 666,80"],
        ["Director encargado", "S/ 3 000,00"],
      ]}
      {...overrides}
    />,
  );
}

describe("tableSummary", () => {
  it("resume columnas y filas con lenguaje llano", () => {
    expect(tableSummary(2, ["Cargo", "Monto"], 3)).toBe(
      "Tabla de la respuesta 2: 2 columnas (Cargo y Monto) y 3 filas.",
    );
    expect(tableSummary(1, ["A", "B", "C"], 1)).toBe(
      "Tabla de la respuesta 1: 3 columnas (A, B y C) y 1 fila.",
    );
  });

  it("no lee la negrita ni las citas del encabezado", () => {
    expect(tableSummary(1, ["**Monto** [1]", "Plazo"], 2)).toBe(
      "Tabla de la respuesta 1: 2 columnas (Monto y Plazo) y 2 filas.",
    );
  });
});

describe("ChatTable", () => {
  it("expone la tabla con un nombre que resume su contenido y encabezados de columna", () => {
    renderTable();

    const table = screen.getByRole("table", {
      name: "Tabla de la respuesta 1: 2 columnas (Cargo y Remuneración mensual) y 2 filas.",
    });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual([
      "Cargo",
      "Remuneración mensual",
    ]);
    expect(
      headers.every((header) => header.getAttribute("scope") === "col"),
    ).toBe(true);
    expect(within(table).getAllByRole("row")).toHaveLength(3);
  });

  it("permite desplazarse con el teclado dentro de la tabla, no de la página", () => {
    renderTable();

    const region = screen.getByRole("region", {
      name: "Tabla de la respuesta 1. Desplázate horizontalmente si es necesario.",
    });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveClass("avend-chat-table-scroll");
    expect(region).toContainElement(screen.getByRole("table"));
  });

  it("ajusta el ancho mínimo al número de columnas para no desplazar tablas cortas", () => {
    renderTable();

    expect(screen.getByRole("table")).toHaveStyle({
      "--avend-table-columns": "2",
    });
  });

  it("renderiza cada celda con el formato que le da el chat", () => {
    renderTable({
      renderCell: (text) => <em data-testid="cell">{text}</em>,
    });

    expect(screen.getAllByTestId("cell")).toHaveLength(6);
  });

  describe("pista de desplazamiento", () => {
    let measure: (() => void) | null = null;

    beforeEach(() => {
      vi.stubGlobal(
        "ResizeObserver",
        class {
          constructor(callback: () => void) {
            measure = callback;
          }
          disconnect() {}
          observe() {}
          unobserve() {}
        },
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      measure = null;
    });

    function setWidths(scrollWidth: number, clientWidth: number) {
      vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(
        scrollWidth,
      );
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(
        clientWidth,
      );
    }

    it("avisa con texto visible cuando la tabla no cabe en la pantalla", () => {
      renderTable();
      setWidths(544, 290);

      act(() => measure?.());

      expect(screen.getByText(HINT)).toBeVisible();
    });

    it("no muestra la pista cuando la tabla cabe completa", () => {
      renderTable();
      setWidths(272, 290);

      act(() => measure?.());

      expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    });

    it("retira la pista si la ventana se ensancha y la tabla ya cabe", () => {
      renderTable();
      setWidths(544, 290);
      act(() => measure?.());
      expect(screen.getByText(HINT)).toBeInTheDocument();

      setWidths(544, 700);
      act(() => measure?.());

      expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    });
  });

  it("sin ResizeObserver no falla ni inventa una pista", () => {
    renderTable();

    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });
});
