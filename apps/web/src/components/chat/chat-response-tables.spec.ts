import { describe, expect, it } from "vitest";
import {
  markdownTableAt,
  markdownTablesToPlainText,
  tableRowsCiteKnownSources,
} from "./chat-response-tables";

describe("markdownTableAt", () => {
  it("accepts a compact table with a valid separator", () => {
    expect(
      markdownTableAt(
        [
          "| Escala | Monto |",
          "| --- | ---: |",
          "| Primera | S/ 3 300,00 |",
        ],
        0,
      ),
    ).toEqual({
      endIndex: 3,
      headers: ["Escala", "Monto"],
      rows: [["Primera", "S/ 3 300,00"]],
    });
  });

  it("does not mistake a sentence with a bar for a table", () => {
    expect(markdownTableAt(["A | B es una frase normal."], 0)).toBeNull();
  });

  it("does not accept a grid that exceeds the six-row response limit", () => {
    const lines = [
      "| Columna A | Columna B |",
      "| --- | --- |",
      ...Array.from({ length: 7 }, (_, index) => `| ${index} | ${index} |`),
    ];
    expect(markdownTableAt(lines, 0)).toBeNull();
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
});

describe("markdownTablesToPlainText", () => {
  it("preserves normal prose and turns only recognized tables into rows", () => {
    expect(
      markdownTablesToPlainText(
        "Antes\n| Cargo | Monto |\n| --- | --- |\n| Docente | S/ 2 666,80 |\nDespués",
      ),
    ).toBe("Antes\nCargo\tMonto\nDocente\tS/ 2 666,80\nDespués");
  });
});
