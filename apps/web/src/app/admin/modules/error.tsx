"use client";

import { useTransition } from "react";

/**
 * Error al cargar Módulos. No afirma que «ningún cambio fue aplicado»: esta
 * pantalla también aparece al recargar la vista DESPUÉS de crear un módulo o de
 * subir un documento, cuando el guardado ya se hizo. Tampoco culpa a la
 * conexión de la persona: lo habitual es un servicio ocupado o iniciando.
 *
 * «Reintentar» usa `retry` de Next 16 (vuelve a pedir los datos al servidor y
 * limpia el error). `reset` solo limpiaba el error y volvía a pintar la misma
 * respuesta fallida, así que el botón no recuperaba nada.
 */
export default function ModulesError({ retry }: { retry: () => void }) {
  const [isRetrying, startRetry] = useTransition();

  return (
    <main className="mx-auto w-full max-w-3xl p-5 sm:p-8">
      <section
        aria-labelledby="modules-error-title"
        className="rounded-xl border border-red-300 bg-red-50 p-6 text-red-950"
        role="alert"
      >
        <h1 className="text-xl font-bold" id="modules-error-title">
          No pudimos cargar Módulos
        </h1>
        <p className="mt-2 text-base leading-7">
          El servicio puede estar ocupado o iniciando. Espera un momento y pulsa
          «Reintentar».
        </p>
        <p className="mt-2 text-base leading-7">
          Si acababas de crear un módulo o de subir un documento, es posible que
          ya se haya guardado: revisa la lista después de reintentar antes de
          repetirlo.
        </p>
        <button
          aria-busy={isRetrying}
          className="mt-5 min-h-11 rounded-md bg-avend-navy px-5 text-base font-semibold text-white disabled:opacity-70"
          disabled={isRetrying}
          onClick={() => startRetry(() => retry())}
          type="button"
        >
          {isRetrying ? "Cargando…" : "Reintentar"}
        </button>
      </section>
    </main>
  );
}
