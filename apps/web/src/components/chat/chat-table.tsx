"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  firstColumnLabels,
  isBlankCell,
  type ColumnAlignment,
} from "./chat-response-tables";

/** Marcas que el chat interpreta y que un lector de pantalla no debe leer. */
const HEADER_MARKUP =
  /\*\*|__|\s*\[\[?\s*\d+(?:\s*(?:[,;–-]|y)\s*\d+)*\s*\]\]?/gu;

/** Texto de un encabezado sin las marcas que el chat interpreta. */
function plainHeader(header: string): string {
  return header.replace(HEADER_MARKUP, "").trim();
}

/**
 * En un teléfono una tabla de tres o más columnas obliga a deslizar de lado y
 * perder el nombre de la fila: se muestra cada fila como una tarjeta apilada
 * (ver `avend-chat-table--stacked`). Con dos columnas cabe sin deslizar.
 */
const STACKED_FROM_COLUMNS = 3;

function joinNames(names: readonly string[]): string {
  return names.length > 1
    ? `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`
    : names.join("");
}

/**
 * Resumen que se anuncia al entrar en la tabla: cuántas columnas y filas tiene
 * y cómo se llaman, para decidir si leerla sin recorrerla celda por celda.
 */
export function tableSummary(
  index: number,
  headers: readonly string[],
  rowCount: number,
): string {
  const names = headers.map(plainHeader);
  return `Tabla de la respuesta ${index}: ${names.length} columnas (${joinNames(names)}) y ${rowCount} ${rowCount === 1 ? "fila" : "filas"}.`;
}

interface ChatTableProps {
  /** Alineación por columna (`undefined` = normal); ver `columnAlignments`. */
  alignments?: Array<ColumnAlignment | undefined>;
  headers: string[];
  index: number;
  /** Da formato a una celda (citas, negrita, enlaces) como en el resto del chat. */
  renderCell: (text: string) => ReactNode;
  rows: string[][];
}

/**
 * Tabla breve de la respuesta. El desplazamiento horizontal ocurre dentro de la
 * tabla y nunca en la página; si no cabe en la pantalla se dice con texto
 * visible, porque una barra de desplazamiento fina no basta para quien no sabe
 * que debe deslizar. El nombre accesible resume la tabla (columnas y filas).
 */
export function ChatTable({
  alignments = [],
  headers,
  index,
  renderCell,
  rows,
}: ChatTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const labels = firstColumnLabels(rows);
  const stacked = headers.length >= STACKED_FROM_COLUMNS;

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () =>
      setOverflowing(element.scrollWidth > element.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="avend-chat-table-block">
      <div
        aria-label={`Tabla de la respuesta ${index}. Desplázate horizontalmente si es necesario.`}
        className="avend-chat-table-scroll"
        ref={scrollRef}
        role="region"
        tabIndex={0}
      >
        {/* Los roles explícitos mantienen la semántica de tabla cuando, en el
            teléfono, el CSS apila las filas (algunos lectores de pantalla la
            pierden al cambiar `display`). */}
        <table
          className={
            stacked
              ? "avend-chat-table avend-chat-table--stacked"
              : "avend-chat-table"
          }
          role="table"
          style={{ "--avend-table-columns": headers.length } as CSSProperties}
        >
          <caption className="avend-visually-hidden">
            {tableSummary(index, headers, rows.length)}
          </caption>
          <thead role="rowgroup">
            <tr role="row">
              {headers.map((header, column) => (
                <th
                  data-align={alignments[column]}
                  key={`${column}-${header}`}
                  role="columnheader"
                  scope="col"
                >
                  {renderCell(header)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {rows.map((row, rowIndex) => (
              <tr key={`${rowIndex}-${row.join("|")}`} role="row">
                {row.map((cell, column) => {
                  const common = {
                    "data-align": alignments[column],
                    "data-label": plainHeader(headers[column] ?? ""),
                  };
                  const { inherited, label } = labels[rowIndex];
                  // La primera columna nombra la fila: es su encabezado.
                  if (column === 0 && label) {
                    return (
                      <th
                        {...common}
                        key={`${column}-${cell}`}
                        role="rowheader"
                        scope="row"
                      >
                        {inherited ? (
                          // Celda combinada: en pantalla ancha se ve vacía (el
                          // grupo está en la fila de arriba) y en la tarjeta del
                          // teléfono se muestra; el lector de pantalla siempre lo lee.
                          // Va como texto, sin la cita ni el enlace del original:
                          // un enlace invisible recibiría el foco del teclado.
                          <span className="avend-chat-table-inherited avend-visually-hidden">
                            {label}
                          </span>
                        ) : (
                          renderCell(cell)
                        )}
                      </th>
                    );
                  }
                  return (
                    <td
                      {...common}
                      data-blank={isBlankCell(cell) ? "true" : undefined}
                      key={`${column}-${cell}`}
                      role="cell"
                    >
                      {renderCell(cell)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {overflowing ? (
        <p aria-hidden="true" className="avend-chat-table-hint">
          Desliza hacia los lados para ver todas las columnas.
        </p>
      ) : null}
    </div>
  );
}
