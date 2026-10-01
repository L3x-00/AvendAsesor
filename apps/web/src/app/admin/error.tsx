"use client";

import { useTransition } from "react";

/**
 * Error general del panel administrativo. «Actualizar vista» usa `retry` de
 * Next 16, que vuelve a pedir los datos al servidor; `reset` solo limpiaba el
 * error y repetía la misma respuesta fallida.
 *
 * No promete que nada cambió: la vista puede fallar al recargarse justo
 * después de una operación que sí se guardó.
 */
export default function AdminError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const [isRetrying, startRetry] = useTransition();

  return (
    <main className="flex min-h-screen items-center justify-center bg-avend-surface-muted px-4 text-avend-text">
      <section className="avend-elevated w-full max-w-md rounded-lg border border-avend-border bg-avend-surface p-6 text-center">
        <h1 className="text-xl font-bold">
          No se pudo cargar la administración
        </h1>
        <p className="mt-2 text-base leading-6 text-avend-text-muted">
          Verifica que tu sesión siga abierta. El servicio de administración
          puede estar ocupado o iniciando: espera un momento y vuelve a
          intentarlo. Actualizar la vista solo vuelve a leer la información; no
          repite ninguna acción.
        </p>
        <button
          aria-busy={isRetrying}
          className="avend-button avend-button--primary mt-5"
          disabled={isRetrying}
          onClick={() => startRetry(() => retry())}
          type="button"
        >
          {isRetrying ? "Cargando…" : "Actualizar vista"}
        </button>
      </section>
    </main>
  );
}
