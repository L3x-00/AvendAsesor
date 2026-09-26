"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import "./lattice-loader.css";

/**
 * Indicador de "pensando" basado en LatticeLoader de React Bits
 * (https://reactbits.dev, licencia MIT), portado a TypeScript y al español.
 *
 * Una rejilla de puntos se enciende en ola mientras `status` es "working";
 * al pasar a "done" o "error" se congela y se disuelve en una marca, y el
 * cronómetro se detiene. El estado se anuncia a lectores de pantalla con
 * `role="status"`; la animación respeta `prefers-reduced-motion`.
 */

type Grid = 3 | 4;
type LatticeStatus = "done" | "error" | "working";

interface PatternDef {
  cells: (number | null)[];
  lit?: number;
  loop: number;
  scale: number;
}

const PATTERNS: Record<string, Partial<Record<Grid, PatternDef>>> = {
  arrow: { 3: { cells: [1, 2, 3, 0, 1, 2, 1, 2, 3], loop: 7.2, scale: 1 } },
  dots: { 3: { cells: [0, 1, 2, 0, 1, 2, 0, 1, 2], loop: 3, scale: 2.4 } },
  orbit: {
    3: { cells: [0, 1, 2, 7, null, 3, 6, 5, 4], loop: 8, scale: 1.2 },
    4: {
      cells: [0, 1, 2, 3, 11, null, null, 4, 10, null, null, 5, 9, 8, 7, 6],
      lit: 0.45,
      loop: 6,
      scale: 1.2,
    },
  },
  pulse: {
    4: {
      cells: [2, 1, 1, 2, 1, 0, 0, 1, 1, 0, 0, 1, 2, 1, 1, 2],
      lit: 0.45,
      loop: 2.4,
      scale: 2.5,
    },
  },
  rain: {
    4: {
      cells: [0, 2, 1, 3, 1, 3, 2, 4, 2, 4, 3, 5, 3, 5, 4, 6],
      lit: 0.35,
      loop: 4,
      scale: 1.2,
    },
  },
  ripple: { 3: { cells: [2, 1, 2, 1, 0, 1, 2, 1, 2], loop: 4.8, scale: 1.5 } },
  snake: {
    3: { cells: [0, 1, 2, 5, 4, 3, 6, 7, 8], lit: 0.35, loop: 9, scale: 1 },
    4: {
      cells: [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10, 11, 15, 14, 13, 12],
      lit: 0.25,
      loop: 16,
      scale: 1,
    },
  },
  spin: {
    4: {
      cells: [0, 0, 1, 1, 0, 0, 1, 1, 3, 3, 2, 2, 3, 3, 2, 2],
      lit: 0.35,
      loop: 4,
      scale: 1.6,
    },
  },
  spiral: {
    3: { cells: [0, 1, 2, 7, 8, 3, 6, 5, 4], lit: 0.35, loop: 9, scale: 1.2 },
  },
  sweep: {
    4: {
      cells: [0, 1, 2, 3, 1, 2, 3, 4, 2, 3, 4, 5, 3, 4, 5, 6],
      lit: 0.45,
      loop: 5,
      scale: 1,
    },
  },
};

const DEFAULT_PATTERN: Record<Grid, string> = { 3: "orbit", 4: "sweep" };

const MARKS: Record<Grid, Record<"done" | "error", number[]>> = {
  3: { done: [2, 3, 5, 7], error: [0, 2, 4, 6, 8] },
  4: { done: [7, 8, 10, 13], error: [0, 3, 5, 6, 9, 10, 12, 15] },
};

function resolvePattern(pattern: string, grid: Grid): PatternDef {
  return (
    PATTERNS[pattern]?.[grid] ?? PATTERNS[DEFAULT_PATTERN[grid]][grid]!
  );
}

/** Décimas de segundo → "3.2s" o "1m 4.0s". */
function formatElapsed(ds: number): string {
  return ds < 600
    ? `${(ds / 10).toFixed(1)}s`
    : `${Math.floor(ds / 600)}m ${((ds % 600) / 10).toFixed(1)}s`;
}

function spokenElapsed(ds: number): string {
  return ds < 600
    ? `${(ds / 10).toFixed(1)} segundos`
    : `${Math.floor(ds / 600)} minutos ${((ds % 600) / 10).toFixed(1)} segundos`;
}

export interface LatticeLoaderProps {
  className?: string;
  color?: string;
  doneColor?: string;
  doneLabel?: string;
  errorColor?: string;
  errorLabel?: string;
  fontSize?: number;
  gap?: number;
  cellSize?: number;
  grid?: Grid;
  idleOpacity?: number;
  label?: string;
  pattern?: string;
  shape?: "round" | "square";
  showTimer?: boolean;
  status?: LatticeStatus;
  step?: number;
  style?: CSSProperties;
}

export function LatticeLoader({
  cellSize = 6,
  className = "",
  color = "currentColor",
  doneColor = "#05713d",
  doneLabel = "Listo en",
  errorColor = "#b42318",
  errorLabel = "Se detuvo tras",
  fontSize = 16,
  gap = 2,
  grid = 3,
  idleOpacity = 0.15,
  label = "Pensando",
  pattern = "orbit",
  shape = "round",
  showTimer = true,
  status = "working",
  step = 90,
  style,
}: LatticeLoaderProps) {
  const n: Grid = grid === 4 ? 4 : 3;
  const pat = resolvePattern(pattern, n);
  const marks = MARKS[n];
  const d = step * pat.scale;
  const cycle = Math.round(pat.loop * d);
  const mark = status === "error" ? "error" : "done";

  const timerRef = useRef<HTMLSpanElement>(null);
  const elapsedRef = useRef(0);
  const [announce, setAnnounce] = useState(`${label}…`);

  useLayoutEffect(() => {
    if (status !== "working") return;
    const paint = (ds: number) => {
      elapsedRef.current = ds;
      if (timerRef.current) timerRef.current.textContent = formatElapsed(ds);
    };
    const startedAt = performance.now();
    paint(0);
    const id = window.setInterval(
      () => paint(Math.floor((performance.now() - startedAt) / 100)),
      100,
    );
    return () => window.clearInterval(id);
  }, [status]);

  useEffect(() => {
    // Solo se anuncia el cambio de estado, no cada décima del cronómetro.
    setAnnounce(
      status === "working"
        ? `${label}…`
        : `${status === "done" ? doneLabel : errorLabel}${showTimer ? ` ${spokenElapsed(elapsedRef.current)}` : ""}`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, label]);

  const lit = pat.lit && pat.lit !== 0.62 ? Math.round(pat.lit * 100) : undefined;

  return (
    <span
      className={`lattice-loader${className ? ` ${className}` : ""}`}
      data-shape={shape}
      data-status={status}
      role="status"
      style={
        {
          "--ll-cell": `${cellSize}px`,
          "--ll-color": color,
          "--ll-cycle": `${cycle}ms`,
          "--ll-font": `${fontSize}px`,
          "--ll-gap": `${gap}px`,
          "--ll-idle": idleOpacity,
          "--ll-mark": status === "error" ? errorColor : doneColor,
          "--ll-n": n,
          ...style,
        } as CSSProperties
      }
    >
      <span aria-hidden="true" className="lattice-loader__grid">
        <span className="lattice-loader__layer lattice-loader__run">
          {pat.cells.map((unit, index) => (
            <span
              className="lattice-loader__cell"
              data-hole={unit == null ? "" : undefined}
              data-lit={lit}
              key={index}
              style={
                unit == null
                  ? undefined
                  : { animationDelay: `${Math.round(unit * d)}ms` }
              }
            />
          ))}
        </span>
        <span className="lattice-loader__layer lattice-loader__mark">
          {pat.cells.map((_, index) => (
            <span
              className="lattice-loader__cell"
              data-on={marks[mark].includes(index) ? "" : undefined}
              key={index}
            />
          ))}
        </span>
      </span>
      <span aria-hidden="true" className="lattice-loader__label">
        <span
          className="lattice-loader__text"
          data-active={status === "working" ? "" : undefined}
        >
          {label}
        </span>
        <span
          className="lattice-loader__text"
          data-active={status === "done" ? "" : undefined}
        >
          {doneLabel}
        </span>
        <span
          className="lattice-loader__text"
          data-active={status === "error" ? "" : undefined}
        >
          {errorLabel}
        </span>
      </span>
      {showTimer ? (
        <span
          aria-hidden="true"
          className="lattice-loader__timer"
          ref={timerRef}
        >
          0.0s
        </span>
      ) : null}
      <span className="lattice-loader__sr">{announce}</span>
    </span>
  );
}
