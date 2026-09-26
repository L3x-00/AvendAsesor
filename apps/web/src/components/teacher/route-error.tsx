"use client";

import Link from "next/link";
import { useEffect, useRef, useTransition } from "react";

interface RouteErrorProps {
  /** Vuelve a pedir y renderizar el segmento (`retry` del límite de Next 16). */
  retry: () => void;
  /**
   * "section": dentro del marco docente (la barra lateral sigue disponible).
   * "page": sin marco; puede tocar a cualquier ruta, así que el texto es neutro.
   */
  variant?: "page" | "section";
}

const COPY = {
  page: {
    reassurance:
      "Puede ser una falla momentánea de conexión o que el servicio esté iniciando. No se perdió ni se modificó información.",
    secondary: { href: "/", label: "Ir al inicio" },
  },
  section: {
    reassurance:
      "Puede ser una falla momentánea de conexión o que el servicio esté iniciando. Tus conversaciones y tu cuenta están a salvo: no se perdió ni se modificó nada.",
    secondary: { href: "/chat", label: "Ir al chat" },
  },
} as const;

/**
 * Error amable: explica en lenguaje llano qué pasó, tranquiliza sobre los
 * datos y ofrece dos salidas claras. No muestra detalles técnicos (ni el
 * mensaje ni el `digest` del error).
 */
export function RouteError({ retry, variant = "section" }: RouteErrorProps) {
  const [isRetrying, startRetry] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const copy = COPY[variant];
  const Wrapper = variant === "page" ? "main" : "section";

  useEffect(() => {
    // Quien navega con teclado o lector de pantalla llega directo al aviso.
    headingRef.current?.focus();
  }, []);

  return (
    <Wrapper
      aria-labelledby="route-error-title"
      className={`avend-route-error avend-route-error--${variant}`}
    >
      <div className="avend-route-error-card">
        <span aria-hidden="true" className="avend-route-error-icon">
          <svg fill="none" viewBox="0 0 24 24">
            <path d="M4 14.5a4.5 4.5 0 0 1 3.2-4.3A5.5 5.5 0 0 1 18 9.5a4 4 0 0 1 .5 8H8a4 4 0 0 1-4-3Z" />
            <path d="M12 11v3M12 16.5v.01" />
          </svg>
        </span>
        <h1 id="route-error-title" ref={headingRef} tabIndex={-1}>
          No pudimos cargar esta sección
        </h1>
        <p>{copy.reassurance}</p>
        <div className="avend-route-error-actions">
          <button
            aria-busy={isRetrying}
            className="avend-button avend-button--primary"
            disabled={isRetrying}
            onClick={() => startRetry(() => retry())}
            type="button"
          >
            {isRetrying ? (
              <span aria-hidden="true" className="avend-button-spinner" />
            ) : null}
            <span>{isRetrying ? "Intentando…" : "Intentar de nuevo"}</span>
          </button>
          <Link
            className="avend-button avend-button--secondary"
            href={copy.secondary.href}
          >
            {copy.secondary.label}
          </Link>
        </div>
        <p className="avend-route-error-hint">
          Si el problema continúa después de unos minutos, avisa a la persona
          responsable de la plataforma.
        </p>
      </div>
    </Wrapper>
  );
}
