import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatTable, salaryModalityGroups, tableSummary } from "./chat-table";

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

describe("salaryModalityGroups", () => {
  const salaryHeaders = [
    "Modalidad / Forma",
    "Nivel / Ciclo",
    "Jornada laboral",
    "Remuneración mensual",
  ];

  it("solo agrupa modalidades iguales y contiguas de una tabla salarial", () => {
    expect(
      salaryModalityGroups(salaryHeaders, [
        ["Educación Básica Regular – EBR", "Inicial", "30 horas", "S/ 3 500,70"],
        ["Educación Básica Regular – EBR", "Primaria", "30 horas", "S/ 3 500,70"],
        ["Educación Básica Regular – EBR", "Secundaria", "30 horas", "S/ 3 500,70"],
        ["Educación Básica Especial – EBE", "Inicial", "30 horas", "S/ 3 500,70"],
        ["Educación Básica Especial – EBE", "Primaria", "30 horas", "S/ 3 500,70"],
        ["Educación Básica Regular – EBR", "Inicial", "30 horas", "S/ 3 500,70"],
      ]),
    ).toEqual([
      { rowSpan: 3 },
      { inheritedLabel: "Educación Básica Regular – EBR" },
      { inheritedLabel: "Educación Básica Regular – EBR" },
      { rowSpan: 2 },
      { inheritedLabel: "Educación Básica Especial – EBE" },
      {},
    ]);
  });

  it("no aplica el formato salarial a tablas que no declaran modalidad y forma", () => {
    expect(
      salaryModalityGroups(
        ["Modalidad", "Nivel", "Remuneración mensual"],
        [
          ["EBR", "Inicial", "S/ 3 500,70"],
          ["EBR", "Primaria", "S/ 3 500,70"],
        ],
      ),
    ).toEqual([{}, {}]);
  });

  it("no une rótulos iguales cuando sus fuentes son diferentes", () => {
    expect(
      salaryModalityGroups(salaryHeaders, [
        ["EBR [1]", "Inicial", "30 horas", "S/ 3 500,70"],
        ["EBR [2]", "Primaria", "30 horas", "S/ 3 500,70"],
      ]),
    ).toEqual([{}, {}]);
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

  it("la primera columna es el encabezado de cada fila", () => {
    renderTable();

    const rowHeaders = screen.getAllByRole("rowheader");
    expect(rowHeaders.map((cell) => cell.textContent)).toEqual([
      "Docente coordinador",
      "Director encargado",
    ]);
    expect(rowHeaders.every((cell) => cell.getAttribute("scope") === "row")).toBe(
      true,
    );
    // Los datos siguen siendo celdas, no encabezados.
    expect(screen.getAllByRole("cell")).toHaveLength(2);
  });

  it("agrupa la modalidad salarial repetida sin alterar los niveles ni los montos", () => {
    renderTable({
      headers: [
        "Modalidad / Forma",
        "Nivel / Ciclo",
        "Jornada laboral",
        "Remuneración mensual",
      ],
      rows: [
        ["Educación Básica Regular – EBR", "Inicial", "30 horas", "S/ 3 500,70"],
        ["Educación Básica Regular – EBR", "Primaria", "30 horas", "S/ 3 500,70"],
        ["Educación Básica Regular – EBR", "Secundaria", "30 horas", "S/ 3 500,70"],
        ["Educación Básica Especial – EBE", "Inicial", "30 horas", "S/ 3 500,70"],
        ["Educación Básica Especial – EBE", "Primaria", "30 horas", "S/ 3 500,70"],
        ["Educación Básica Alternativa – EBA", "Inicial / Intermedio", "30 horas", "S/ 3 500,70"],
        ["Educación Básica Alternativa – EBA", "Avanzado", "30 horas", "S/ 3 500,70"],
        ["Educación Técnica Productiva – ETP", "Básico y Medio", "30 horas", "S/ 3 500,70"],
      ],
    });

    expect(
      screen
        .getByRole("rowheader", { name: "Educación Básica Regular – EBR" })
        .getAttribute("rowspan"),
    ).toBe("3");
    expect(
      screen
        .getByRole("rowheader", { name: "Educación Básica Especial – EBE" })
        .getAttribute("rowspan"),
    ).toBe("2");
    expect(
      screen
        .getByRole("rowheader", { name: "Educación Básica Alternativa – EBA" })
        .getAttribute("rowspan"),
    ).toBe("2");
    expect(
      screen
        .getByRole("rowheader", { name: "Educación Técnica Productiva – ETP" })
        .hasAttribute("rowspan"),
    ).toBe(false);
    expect(screen.getAllByText("S/ 3 500,70")).toHaveLength(8);
    expect(screen.getAllByRole("row")).toHaveLength(9);

    const primariaEbr = screen.getAllByRole("row")[2];
    expect(within(primariaEbr).queryByRole("rowheader")).not.toBeInTheDocument();
    expect(primariaEbr).toHaveAttribute(
      "data-group-label",
      "Educación Básica Regular – EBR",
    );
  });

  it("una celda combinada hereda el grupo para el lector de pantalla y no se pierde la fila", () => {
    renderTable({
      headers: ["Modalidad", "Nivel", "Monto"],
      rows: [
        ["EBR", "Inicial", "S/ 3 300,60"],
        ["", "Primaria", "S/ 3 300,60"],
        ["", "-", "-"],
      ],
    });

    const rowHeaders = screen.getAllByRole("rowheader");
    expect(rowHeaders.map((cell) => cell.textContent)).toEqual(["EBR", "EBR"]);
    const inherited = rowHeaders[1].querySelector(".avend-chat-table-inherited");
    expect(inherited).toHaveClass("avend-visually-hidden");
    // La fila sin ningún dato no inventa un grupo: su primera celda queda vacía.
    const lastRow = screen.getAllByRole("row")[3];
    expect(within(lastRow).queryByRole("rowheader")).not.toBeInTheDocument();
  });

  it("el grupo heredado es texto plano: sin el enlace de cita que traía la celda original", () => {
    renderTable({
      headers: ["Modalidad", "Nivel"],
      renderCell: (text) => <a href="#fuente">{text}</a>,
      rows: [
        ["EBR [2]", "Inicial"],
        ["", "Primaria"],
      ],
    });

    const inherited = screen
      .getAllByRole("rowheader")[1]
      .querySelector(".avend-chat-table-inherited");
    expect(inherited).toHaveTextContent(/^EBR$/u);
    expect(inherited?.querySelector("a")).toBeNull();
  });

  it("marca las celdas sin dato para no mostrarlas en la tarjeta", () => {
    renderTable({
      headers: ["Cargo", "Jornada", "Monto"],
      rows: [["Coordinador", "-", "S/ 4 400,80"], ["Director", "", "S/ 3 000,00"]],
    });

    const cells = screen.getAllByRole("cell");
    expect(cells.map((cell) => cell.hasAttribute("data-blank"))).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  it("marca la alineación de cada columna y la etiqueta de cada dato", () => {
    renderTable({ alignments: [undefined, "right"] });

    const header = screen.getByRole("columnheader", {
      name: "Remuneración mensual",
    });
    expect(header).toHaveAttribute("data-align", "right");
    const amounts = screen
      .getAllByRole("cell")
      .map((cell) => [cell.getAttribute("data-align"), cell.getAttribute("data-label")]);
    expect(amounts).toEqual([
      ["right", "Remuneración mensual"],
      ["right", "Remuneración mensual"],
    ]);
    expect(
      screen.getAllByRole("rowheader")[0].getAttribute("data-align"),
    ).toBeNull();
  });

  it("la etiqueta de la tarjeta no lleva negrita ni citas del encabezado", () => {
    renderTable({ headers: ["Cargo", "**Monto** [1]"] });

    expect(screen.getAllByRole("cell")[0]).toHaveAttribute("data-label", "Monto");
  });

  it("apila las filas en el teléfono solo desde tres columnas", () => {
    const { unmount } = renderTable();
    expect(screen.getByRole("table")).not.toHaveClass("avend-chat-table--stacked");
    unmount();

    renderTable({
      headers: ["Cargo", "Jornada", "Monto"],
      rows: [["Docente", "30", "S/ 3 300,60"]],
    });
    expect(screen.getByRole("table")).toHaveClass("avend-chat-table--stacked");
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
