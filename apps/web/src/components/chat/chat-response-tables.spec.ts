import { describe, expect, it } from "vitest";
import {
  classifyTableAt,
  columnAlignments,
  firstColumnLabels,
  hasCitationColumn,
  markdownTableAt,
  markdownTableRowsAsText,
  markdownTablesToPlainText,
  singleRowTableHasAdjacentKnownCitation,
  STRUCTURED_SALARY_MARKER,
  structuredSalaryRowsToMarkdown,
  tableRowsCiteKnownSources,
  withoutCitationColumns,
} from "./chat-response-tables";

describe("structuredSalaryRowsToMarkdown", () => {
  it("convierte la respuesta salarial real de diez viñetas en una tabla", () => {
    const answer = [
      "La remuneración varía según la modalidad:",
      "",
      "- Modalidad / Forma: Educación Básica Regular – EBR; Nivel / Ciclo: Inicial; Jornada laboral: 30; Remuneración mensual (S/): 3 500,70",
      "- Modalidad / Forma: Educación Básica Regular – EBR; Nivel / Ciclo: Primaria; Jornada laboral: 30; Remuneración mensual (S/): 3 500,70",
      "- Modalidad / Forma: Educación Básica Regular – EBR; Nivel / Ciclo: Secundaria; Jornada laboral: 30; Remuneración mensual (S/): 3 500,70",
      "- Modalidad / Forma: Educación Básica Especial – EBE; Nivel / Ciclo: Inicial; Jornada laboral: 30; Remuneración mensual (S/): 3 500,70",
      "- Modalidad / Forma: Educación Básica Especial – EBE; Nivel / Ciclo: Primaria; Jornada laboral: 30; Remuneración mensual (S/): 3 500,70",
      "- Modalidad / Forma: Educación Básica Alternativa – EBA; Nivel / Ciclo: Inicial / Intermedio; Jornada laboral: 30; Remuneración mensual (S/): 3 500,70",
      "- Modalidad / Forma: Educación Básica Alternativa – EBA; Nivel / Ciclo: Avanzado; Jornada laboral: 30; Remuneración mensual (S/): 3 500,70",
      "- Modalidad / Forma: Educación Técnico Productiva – ETP; Nivel / Ciclo: Básico y Medio; Jornada laboral: 30; Remuneración mensual (S/): 3 500,70",
      "- Modalidad / Forma: Profesor Coordinador (PRONOEI); Remuneración mensual (S/): 4 667,60",
      "- Modalidad / Forma: Docente Coordinador (ONDEC/ODEC); Remuneración mensual (S/): 4 667,60",
      "",
      "Los docentes con una jornada menor reciben un monto proporcional. [1][2][3][4][5]",
    ].join("\n");

    const formatted = structuredSalaryRowsToMarkdown(answer);

    expect(formatted).toContain(
      "| Modalidad / Forma | Nivel / Ciclo | Jornada laboral | Remuneración mensual (S/) |",
    );
    expect(formatted).toContain(
      "| Profesor Coordinador (PRONOEI) | — | — | 4 667,60 |",
    );
    expect(formatted).not.toContain("- Modalidad / Forma:");
    expect(formatted).toContain("[1][2][3][4][5]");
  });

  it("no asigna la primera cita del bloque a ninguna fila", () => {
    const answer = [
      "- Modalidad: EBR; Nivel: Inicial; Remuneración: S/ 3 500,70",
      "- Modalidad: EBE; Nivel: Primaria; Remuneración: S/ 3 500,70",
      "",
      "Fuentes: [1][2]",
    ].join("\n");

    const formatted = structuredSalaryRowsToMarkdown(answer);

    expect(formatted).toContain("| EBR | Inicial | S/ 3 500,70 |");
    expect(formatted).not.toContain("S/ 3 500,70 [1] |");
  });

  it("no convierte una lista ordinaria que no es una escala", () => {
    const answer = [
      "- Documento: Solicitud; Presentación: Mesa de partes",
      "- Documento: Certificado; Presentación: Plataforma",
    ].join("\n");

    expect(structuredSalaryRowsToMarkdown(answer)).toBe(answer);
  });

  it("deja intacto de forma atómica un bloque que supera doce filas", () => {
    const answer = Array.from(
      { length: 13 },
      (_, index) =>
        `- Modalidad: EBR; Nivel: ${index + 1}; Remuneración: S/ 3 500,70`,
    ).join("\n");

    expect(structuredSalaryRowsToMarkdown(answer)).toBe(answer);
  });
});

describe("markdownTableAt", () => {
  it("accepts a compact table with a valid separator", () => {
    expect(
      markdownTableAt(
        ["| Escala | Monto |", "| --- | ---: |", "| Primera | S/ 3 300,00 |"],
        0,
      ),
    ).toEqual({
      alignments: [null, "right"],
      endIndex: 3,
      headers: ["Escala", "Monto"],
      rows: [["Primera", "S/ 3 300,00"]],
    });
  });

  it("does not mistake a sentence with a bar for a table", () => {
    expect(markdownTableAt(["A | B es una frase normal."], 0)).toBeNull();
  });

  it("does not accept a grid beyond the presentation row limit", () => {
    const lines = (rows: number) => [
      "| Columna A | Columna B |",
      "| --- | --- |",
      ...Array.from({ length: rows }, (_, index) => `| ${index} | ${index} |`),
    ];
    expect(markdownTableAt(lines(13), 0)).toBeNull();
  });

  it("accepts the nine-row, five-column scale the model emits for teacher pay", () => {
    const lines = [
      "| Modalidad / Forma | Nivel / Ciclo | Jornada laboral | Remuneración mensual (S/) | Cita |",
      "|---|---|---|---|---|",
      "| Educación Básica Regular - EBR | Inicial | 30 | 3,300.60 | [1] |",
      "| | Primaria | 30 | 3,300.60 | [1] |",
      "| | Secundaria | 30 | 3,300.60 | [1] |",
      "| Educación Básica Especial - EBE | Inicial | 30 | 3,300.60 | [1] |",
      "| | Primaria | 30 | 3,300.60 | [1] |",
      "| Educación Básica Alternativa - EBA | Inicial / Intermedio | 30 | 3,300.60 | [1] |",
      "| | Avanzado | 30 | 3,300.60 | [1] |",
      "| Educación Técnico Productiva - ETP | Básico y Medio | 30 | 3,300.60 | [1] |",
      "| Profesor Coordinador PRONOEI | - | - | 4,400.80 | [1] |",
    ];
    const table = markdownTableAt(lines, 0);

    expect(table?.headers).toHaveLength(5);
    expect(table?.rows).toHaveLength(9);
    expect(table?.rows[1]).toEqual(["", "Primaria", "30", "3,300.60", "[1]"]);
    expect(tableRowsCiteKnownSources(table!, [1])).toBe(true);
  });

  it("does not accept a grid with more columns than the presentation limit", () => {
    const wide = Array.from({ length: 7 }, (_, index) => `C${index}`);
    expect(
      markdownTableAt(
        [
          `| ${wide.join(" | ")} |`,
          `| ${wide.map(() => "---").join(" | ")} |`,
          `| ${wide.join(" | ")} |`,
        ],
        0,
      ),
    ).toBeNull();
  });

  it("requires every rendered row to cite one of the message sources", () => {
    const table = markdownTableAt(
      [
        "| Escala | Monto |",
        "| --- | ---: |",
        "| Primera | S/ 3 300,00 [1] |",
        "| Segunda | S/ 2 800,00 [2] |",
      ],
      0,
    );
    expect(table).not.toBeNull();
    expect(tableRowsCiteKnownSources(table!, [1, 2])).toBe(true);
    expect(tableRowsCiteKnownSources(table!, [1])).toBe(false);
  });

  it("permite una sola fila cuando la primera explicación posterior cita una fuente conocida", () => {
    const lines = [
      "| Nivel | Remuneración mensual |",
      "| --- | ---: |",
      "| Secundaria | S/ 3 300,60 |",
      "",
      "El valor aparece en el artículo 3, numeral 2.2. [1]",
    ];
    const table = markdownTableAt(lines, 0);

    expect(table).not.toBeNull();
    expect(singleRowTableHasAdjacentKnownCitation(lines, table!, [1])).toBe(
      true,
    );
    expect(singleRowTableHasAdjacentKnownCitation(lines, table!, [2])).toBe(
      false,
    );
  });

  it("no relaja la evidencia fila por fila para tablas de varias filas", () => {
    const lines = [
      "| Nivel | Remuneración mensual |",
      "| --- | ---: |",
      "| Primaria | S/ 3 300,60 |",
      "| Secundaria | S/ 3 300,60 |",
      "El valor aparece en el artículo 3. [1]",
    ];
    const table = markdownTableAt(lines, 0);

    expect(table).not.toBeNull();
    expect(singleRowTableHasAdjacentKnownCitation(lines, table!, [1])).toBe(
      false,
    );
  });

  it("no busca una cita más allá de la primera explicación posterior", () => {
    const lines = [
      "| Nivel | Remuneración mensual |",
      "| --- | ---: |",
      "| Secundaria | S/ 3 300,60 |",
      "",
      "La norma distingue esta remuneración de otras asignaciones.",
      "La referencia se encuentra en el artículo 3. [1]",
    ];
    const table = markdownTableAt(lines, 0);

    expect(table).not.toBeNull();
    expect(singleRowTableHasAdjacentKnownCitation(lines, table!, [1])).toBe(
      false,
    );
  });
});

describe("markdownTablesToPlainText", () => {
  it("preserves normal prose and turns only recognized tables into rows", () => {
    expect(
      markdownTablesToPlainText(
        "Antes\n| Cargo | Monto |\n| --- | --- |\n| Docente | S/ 2 666,80 [1] |\nDespués",
        [1],
      ),
    ).toBe("Antes\nCargo\tMonto\nDocente\tS/ 2 666,80 [1]\nDespués");
  });

  it("copia por filas legibles la tabla que no es grilla, sin barras ni guiones", () => {
    expect(
      markdownTablesToPlainText(
        "| Cargo | Monto |\n| --- | --- |\n| Docente | S/ 2 666,80 |",
        [1],
      ),
    ).toBe("Cargo: Docente; Monto: S/ 2 666,80");
  });
});

describe("markdownTableRowsAsText", () => {
  it("lee cada fila como «Encabezado: valor» y omite celdas vacías o con guion", () => {
    const table = markdownTableAt(
      [
        "| Nivel | Jornada | Monto |",
        "| --- | --- | --- |",
        "| Primaria | 30 | S/ 3 300,60 [1] |",
        "| Coordinador | - | S/ 4 400,80 [1] |",
        "| | | |",
      ],
      0,
    );

    expect(markdownTableRowsAsText(table!)).toEqual([
      "Nivel: Primaria; Jornada: 30; Monto: S/ 3 300,60 [1]",
      "Nivel: Coordinador; Monto: S/ 4 400,80 [1]",
    ]);
  });
});

describe("classifyTableAt", () => {
  const header = ["| Nivel | Monto |", "| --- | ---: |"];

  it("es grilla solo si cada fila cita una fuente del mensaje", () => {
    const cited = [...header, "| A | 1 [1] |", "| B | 2 [1] |"];
    const mixed = [...header, "| A | 1 [1] |", "| B | 2 |"];
    const foreign = [...header, "| A | 1 [7] |"];

    expect(classifyTableAt(cited, 0, [1])?.asGrid).toBe(true);
    expect(classifyTableAt(mixed, 0, [1])?.asGrid).toBe(false);
    expect(classifyTableAt(foreign, 0, [1])?.asGrid).toBe(false);
    expect(classifyTableAt(cited, 0, [])?.asGrid).toBe(false);
  });

  it("admite una cita de bloque solo cuando la interfaz ya comprobó un documento único", () => {
    const uncited = [
      ...header,
      "| A | 1 |",
      "| B | 2 |",
      STRUCTURED_SALARY_MARKER,
    ];

    expect(classifyTableAt(uncited, 0, [1])?.asGrid).toBe(false);
    expect(classifyTableAt(uncited, 0, [1], 1)?.asGrid).toBe(true);
    expect(classifyTableAt(uncited, 0, [1], 2)?.asGrid).toBe(false);
  });

  it("conserva como grilla una tabla salarial nativa respaldada por un documento único", () => {
    const salary = [
      "| Modalidad / Forma | Nivel / Ciclo | Jornada laboral | Remuneración mensual (S/) |",
      "| --- | --- | ---: | ---: |",
      "| Educación Básica Regular – EBR | Inicial | 30 | 3,500.70 |",
      "| Educación Básica Regular – EBR | Primaria | 30 | 3,500.70 |",
      "",
      "Fuente: [1]",
    ];

    expect(classifyTableAt(salary, 0, [1], 1)?.asGrid).toBe(true);
    expect(classifyTableAt(salary, 0, [1])?.asGrid).toBe(false);
    expect(classifyTableAt(salary, 0, [1], 2)?.asGrid).toBe(false);
  });

  it("no extiende la cita de bloque a una tabla nativa que no es salarial", () => {
    const ordinary = [
      "| Documento | Presentación |",
      "| --- | --- |",
      "| Solicitud | Mesa de partes |",
      "| Certificado | Plataforma |",
      "",
      "Fuente: [1]",
    ];

    expect(classifyTableAt(ordinary, 0, [1], 1)?.asGrid).toBe(false);
  });

  it("no confunde importes contables ni cifras de otra columna con salario", () => {
    const accounting = [
      "| Debe | Haber |",
      "| ---: | ---: |",
      "| 1,500.00 | 1,500.00 |",
    ];
    const unrelatedAmount = [
      "| Sueldo declarado | Multa (S/) |",
      "| --- | ---: |",
      "| No | 3,500.70 |",
    ];

    expect(classifyTableAt(accounting, 0, [1], 1)?.asGrid).toBe(false);
    expect(classifyTableAt(unrelatedAmount, 0, [1], 1)?.asGrid).toBe(false);
  });

  it("reconoce encabezados salariales inequívocos en singular y plural", () => {
    for (const headerName of [
      "Remuneración mensual",
      "Remuneraciones mensuales",
      "Sueldo",
      "Sueldos",
      "Salario",
      "Salarios",
    ]) {
      const table = [
        `| Nivel | ${headerName} |`,
        "| --- | ---: |",
        "| Primaria | S/ 3,500.70 |",
        "| Secundaria | S/ 3,500.70 |",
      ];

      expect(classifyTableAt(table, 0, [1], 1)?.asGrid).toBe(true);
    }
  });

  it("reconoce un importe entero solo dentro de la columna salarial", () => {
    const integerSalary = [
      "| Nivel | Remuneración mensual (S/) |",
      "| --- | ---: |",
      "| Primaria | 3500 |",
      "| Secundaria | 3500 |",
    ];

    expect(classifyTableAt(integerSalary, 0, [1], 1)?.asGrid).toBe(true);
  });

  it("acepta exactamente seis columnas y doce filas como grilla", () => {
    const names = ["A", "B", "C", "D", "E", "F"];
    const row = (n: number) => `| ${names.map(() => `${n} [1]`).join(" | ")} |`;
    const lines = (rows: number) => [
      `| ${names.join(" | ")} |`,
      `| ${names.map(() => "---").join(" | ")} |`,
      ...Array.from({ length: rows }, (_, index) => row(index)),
    ];

    expect(classifyTableAt(lines(12), 0, [1])?.asGrid).toBe(true);
    expect(classifyTableAt(lines(13), 0, [1])).toMatchObject({
      asGrid: false,
      table: { endIndex: 15 },
    });
  });

  it("lee por filas, completa, la tabla con una celda demasiado larga para la grilla", () => {
    const lines = [
      ...header,
      "| A | 1 [1] |",
      `| B | ${"x".repeat(200)} [1] |`,
      "| C | 3 [1] |",
    ];
    const classified = classifyTableAt(lines, 0, [1]);

    expect(classified?.asGrid).toBe(false);
    expect(classified?.table.rows).toHaveLength(3);
    expect(classified?.table.endIndex).toBe(5);
  });

  it("no toma por tabla una frase con barras ni una línea suelta", () => {
    expect(classifyTableAt(["A | B es una frase normal."], 0, [1])).toBeNull();
  });
});

describe("markdownTableRowsAsText con celdas combinadas", () => {
  it("una primera celda vacía continúa el grupo de la fila anterior", () => {
    const table = markdownTableAt(
      [
        "| Modalidad | Nivel | Monto |",
        "| --- | --- | --- |",
        "| EBR | Inicial | 3,300.60 |",
        "| | Primaria | 3,300.60 |",
        "| EBE | Inicial | 3,300.60 |",
        "| | - | 3,300.60 |",
      ],
      0,
    );

    expect(markdownTableRowsAsText(table!)).toEqual([
      "Modalidad: EBR; Nivel: Inicial; Monto: 3,300.60",
      "Modalidad: EBR; Nivel: Primaria; Monto: 3,300.60",
      "Modalidad: EBE; Nivel: Inicial; Monto: 3,300.60",
      "Modalidad: EBE; Monto: 3,300.60",
    ]);
  });
});

function tableFrom(...lines: string[]) {
  const table = markdownTableAt(lines, 0);
  if (!table) throw new Error("tabla de prueba no reconocida");
  return table;
}

describe("columnAlignments", () => {
  it("respeta la alineación escrita en el separador", () => {
    const table = tableFrom(
      "| A | B | C | D |",
      "| :--- | :---: | ---: | --- |",
      "| x | y | z | w |",
    );

    expect(table.alignments).toEqual(["left", "center", "right", null]);
    expect(columnAlignments(table)).toEqual([
      "left",
      "center",
      "right",
      undefined,
    ]);
  });

  it("alinea a la derecha las columnas de cifras y montos aunque el separador no diga nada", () => {
    const table = tableFrom(
      "| Modalidad | Nivel | Jornada | Monto | Cita |",
      "|---|---|---|---|---|",
      "| EBR | Inicial | 30 | S/ 3 300,60 [1] | [1] |",
      "| | Primaria | 30 | 3,300.60 [1] | [1] |",
      "| PRONOEI | - | - | 4,400.80 [1] | [1] |",
    );

    expect(columnAlignments(table)).toEqual([
      undefined, // la primera columna nombra la fila
      undefined, // texto
      "right", // «-» no cuenta como dato
      "right",
      undefined, // solo citas: no es una columna de cifras
    ]);
  });

  it("la primera columna nombra la fila: unos años no se alinean como cifras", () => {
    const table = tableFrom(
      "| Año | Monto |",
      "| --- | --- |",
      "| 2024 | 3 000,00 |",
      "| 2025 | 3 300,60 |",
    );

    expect(columnAlignments(table)).toEqual([undefined, "right"]);
  });

  it("reconoce cifras con signo, negrita y citas agrupadas, y descarta fechas, teléfonos y rangos", () => {
    const column = (...cells: string[]) =>
      columnAlignments(
        tableFrom(
          "| Concepto | Valor |",
          "| --- | --- |",
          ...cells.map((cell, index) => `| fila ${index} | ${cell} |`),
        ),
      )[1];

    expect(column("**3,300.60** [1, 2]", "-150 [1-2]", "S/ -100", "+5 %")).toBe(
      "right",
    );
    expect(column("S/. 1 200", "US$ 100", "1.200,50", "12 %")).toBe("right");
    expect(column("15.03.2025", "20.04.2025")).toBeUndefined(); // fechas
    expect(column("01 615 5800", "01 615 5801")).toBeUndefined(); // teléfonos
    expect(column("30-40", "2025-2026")).toBeUndefined(); // rangos
    expect(column("30 40")).toBeUndefined(); // dos números juntos
  });

  it("no alinea a la derecha una columna con texto mezclado ni una columna vacía", () => {
    const table = tableFrom(
      "| Concepto | Plazo | Notas |",
      "| --- | --- | --- |",
      "| A | 30 días | |",
      "| B | 45 | |",
    );

    expect(columnAlignments(table)).toEqual([undefined, undefined, undefined]);
  });

  it("lo que el modelo escribió gana sobre lo inferido", () => {
    const table = tableFrom(
      "| Concepto | Monto |",
      "| --- | :--- |",
      "| A | 100 |",
    );

    expect(columnAlignments(table)).toEqual([undefined, "left"]);
  });
});

describe("firstColumnLabels", () => {
  it("una primera celda vacía continúa el grupo anterior solo si la fila trae otro dato", () => {
    expect(
      firstColumnLabels([
        ["EBR", "Inicial"],
        ["", "Primaria"],
        ["", "Secundaria"],
        ["", "-"],
        ["EBE", "Inicial"],
        ["", "Primaria"],
      ]),
    ).toEqual([
      { inherited: false, label: "EBR" },
      { inherited: true, label: "EBR" },
      { inherited: true, label: "EBR" },
      { inherited: false, label: "" },
      { inherited: false, label: "EBE" },
      { inherited: true, label: "EBE" },
    ]);
  });

  it("un guion en la primera celda no hereda el grupo: puede significar «no aplica»", () => {
    expect(
      firstColumnLabels([
        ["EBR", "Inicial"],
        ["-", "Total general"],
        ["", "Primaria"],
      ]),
    ).toEqual([
      { inherited: false, label: "EBR" },
      { inherited: false, label: "-" },
      { inherited: true, label: "EBR" },
    ]);
  });

  it("el grupo heredado va sin negrita ni citas: la cita sustenta solo la fila donde está", () => {
    expect(
      firstColumnLabels([
        ["**EBR** [2]", "Inicial [1]"],
        ["", "Primaria [1]"],
      ])[1],
    ).toEqual({ inherited: true, label: "EBR" });
  });

  it("no inventa un grupo cuando la tabla empieza con la primera celda vacía", () => {
    expect(firstColumnLabels([["", "Primaria"]])).toEqual([
      { inherited: false, label: "" },
    ]);
  });
});

describe("withoutCitationColumns", () => {
  const table = (rows: string[][], headers = ["Escala", "Monto", "Cita"]) => ({
    alignments: headers.map(() => null),
    endIndex: rows.length + 2,
    headers,
    rows,
  });

  it("retira la columna que solo trae citas y conserva el resto", () => {
    const result = withoutCitationColumns({
      ...table([
        ["Octava", "2 310,42", "[2]"],
        ["Séptima", "2 090,38", "[1] [2]"],
      ]),
      alignments: [null, "right", "center"],
    });

    expect(result.headers).toEqual(["Escala", "Monto"]);
    expect(result.rows).toEqual([
      ["Octava", "2 310,42"],
      ["Séptima", "2 090,38"],
    ]);
    expect(result.alignments).toEqual([null, "right"]);
    expect(result.endIndex).toBe(4);
  });

  it("no toca una columna con texto además de la cita ni una vacía", () => {
    const mixed = table([["Octava", "2 310,42", "Ver art. 3 [2]"]]);
    expect(withoutCitationColumns(mixed)).toBe(mixed);
    const empty = table([["Octava", "2 310,42", ""]]);
    expect(withoutCitationColumns(empty)).toBe(empty);
  });

  it("tolera filas sin dato en la columna de citas", () => {
    const result = withoutCitationColumns(
      table([
        ["Octava", "2 310,42", "[2]"],
        ["Séptima", "2 090,38", "-"],
      ]),
    );
    expect(result.headers).toEqual(["Escala", "Monto"]);
  });

  it("nunca quita la primera columna y no deja una tabla de una sola columna", () => {
    const onlyCitations = table([["[1]", "[1]", "[1]"]]);
    expect(withoutCitationColumns(onlyCitations)).toBe(onlyCitations);
    const twoColumns = table([["Requisito", "[1]"]], ["Requisito", "Cita"]);
    expect(withoutCitationColumns(twoColumns)).toBe(twoColumns);
    expect(hasCitationColumn(twoColumns)).toBe(true);
  });

  it("Copiar no arrastra una columna de citas vacía", () => {
    const content = [
      "| Escala | Monto | Cita |",
      "| --- | ---: | --- |",
      "| Octava | 2 310,42 | [1] |",
      "| Séptima | 2 090,38 | [1] |",
    ].join("\n");

    expect(markdownTablesToPlainText(content, [1])).toBe(
      "Escala\tMonto\nOctava\t2 310,42\nSéptima\t2 090,38",
    );
  });
});
