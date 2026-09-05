"use client";

export default function DocumentsError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-3xl p-5 sm:p-8">
      <section
        aria-labelledby="documents-error-title"
        className="rounded-xl border border-red-300 bg-red-50 p-6 text-red-950"
        role="alert"
      >
        <h1 className="text-xl font-bold" id="documents-error-title">
          No pudimos cargar los documentos
        </h1>
        <p className="mt-2 text-base leading-7">
          Revisa tu conexión e inténtalo nuevamente. Ningún cambio fue aplicado.
        </p>
        <button
          className="mt-5 min-h-11 rounded-md bg-avend-navy px-5 text-base font-semibold text-white"
          onClick={reset}
          type="button"
        >
          Reintentar
        </button>
      </section>
    </main>
  );
}
