"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/** Marcas que el chat interpreta y que un lector de pantalla no debe leer. */
const HEADER_MARKUP =
  /\*\*|__|\s*\[\[?\s*\d+(?:\s*(?:[,;–-]|y)\s*\d+)*\s*\]\]?/gu;

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
  const names = headers.map((header) =>
    header.replace(HEADER_MARKUP, "").trim(),
  );
  return `Tabla de la respuesta ${index}: ${names.length} columnas (${joinNames(names)}) y ${rowCount} ${rowCount === 1 ? "fila" : "filas"}.`;
}

interface ChatTableProps {
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
  headers,
  index,
  renderCell,
  rows,
}: ChatTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

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
        <table
          className="avend-chat-table"
          style={{ "--avend-table-columns": headers.length } as CSSProperties}
        >
          <caption className="avend-visually-hidden">
            {tableSummary(index, headers, rows.length)}
          </caption>
          <thead>
            <tr>
              {headers.map((header, column) => (
                <th key={`${column}-${header}`} scope="col">
                  {renderCell(header)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${rowIndex}-${row.join("|")}`}>
                {row.map((cell, column) => (
                  <td key={`${column}-${cell}`}>{renderCell(cell)}</td>
                ))}
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
