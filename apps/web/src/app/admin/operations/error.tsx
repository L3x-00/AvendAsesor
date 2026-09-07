"use client";

export default function ConsultationReportsError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <main className="p-6">
      <h1 className="text-xl font-bold">
        No se pudo cargar Consultas y reportes
      </h1>
      <p className="mt-2 text-base text-avend-text-muted">
        Los casos no se han modificado. Intenta cargar la información
        nuevamente.
      </p>
      <button
        className="avend-button avend-button--primary mt-4"
        onClick={reset}
        type="button"
      >
        Reintentar
      </button>
    </main>
  );
}
