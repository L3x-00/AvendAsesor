import { describe, expect, it } from "vitest";
import { friendlyDates } from "./friendly-dates";

describe("friendlyDates", () => {
  it("escribe una fecha única con día, mes y año", () => {
    expect(friendlyDates("Resultados: el 16.01.2026.")).toBe(
      "Resultados: el 16 de enero de 2026.",
    );
    expect(friendlyDates("Se publica el 02/02/2026.")).toBe(
      "Se publica el 2 de febrero de 2026.",
    );
  });

  it("une un periodo dentro del mismo mes", () => {
    expect(friendlyDates("Aplicación: del 14.01.2026 al 15.01.2026.")).toBe(
      "Aplicación: del 14 al 15 de enero de 2026.",
    );
    expect(friendlyDates("Del 13.01.2026 al 14.01.2026 se presentan.")).toBe(
      "Del 13 al 14 de enero de 2026 se presentan.",
    );
  });

  it("conserva el mes de cada extremo cuando el periodo cambia de mes", () => {
    expect(friendlyDates("del 30.01.2026 al 02.02.2026")).toBe(
      "del 30 de enero al 2 de febrero de 2026",
    );
  });

  it("deja los dos años cuando el periodo cruza de año", () => {
    expect(friendlyDates("del 30.12.2025 al 05.01.2026")).toBe(
      "del 30 de diciembre de 2025 al 5 de enero de 2026",
    );
  });

  it("une también las fechas que el modelo ya escribió en lenguaje natural", () => {
    expect(
      friendlyDates("del 13 de enero de 2026 al 14 de enero de 2026"),
    ).toBe("del 13 al 14 de enero de 2026");
  });

  it("no toca fechas imposibles, números de norma ni direcciones", () => {
    expect(friendlyDates("el 31.02.2026")).toBe("el 31.02.2026");
    expect(friendlyDates("RM N.° 123-2024-MINEDU, artículo 5.2.1")).toBe(
      "RM N.° 123-2024-MINEDU, artículo 5.2.1",
    );
    expect(friendlyDates("https://www.gob.pe/archivos/13.01.2026.pdf")).toBe(
      "https://www.gob.pe/archivos/13.01.2026.pdf",
    );
    expect(friendlyDates("código 113.01.2026")).toBe("código 113.01.2026");
    expect(friendlyDates("https://www.gob.pe/x?fecha=13.01.2026&mes=1")).toBe(
      "https://www.gob.pe/x?fecha=13.01.2026&mes=1",
    );
  });

  it("cambia cada fecha de una tabla o lista sin alterar el resto", () => {
    expect(
      friendlyDates(
        "| Resultados | 16.01.2026 | 19.01.2026 |\n- Cierre: 26.01.2026",
      ),
    ).toBe(
      "| Resultados | 16 de enero de 2026 | 19 de enero de 2026 |\n- Cierre: 26 de enero de 2026",
    );
  });
});
