'use client';

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-avend-surface-muted px-4 text-avend-text">
      <section className="avend-elevated w-full max-w-md rounded-lg border border-avend-border bg-avend-surface p-6 text-center">
        <h1 className="text-xl font-bold">No se pudo cargar la administración</h1>
        <p className="mt-2 text-base leading-6 text-avend-text-muted">
          Verifica tu sesión y que el servicio local esté disponible. Reintentar esta lectura no repite ninguna carga de PDF.
        </p>
        <button
          className="avend-button avend-button--primary mt-5"
          onClick={reset}
          type="button"
        >
          Actualizar vista
        </button>
      </section>
    </main>
  );
}
