'use client';

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-900">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold">No se pudo cargar la administración</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Verifica tu sesión y que el servicio local esté disponible. Reintentar esta lectura no repite ninguna carga de PDF.
        </p>
        <button
          className="mt-5 rounded-md bg-sky-700 px-3 py-2 font-semibold text-white"
          onClick={reset}
          type="button"
        >
          Actualizar vista
        </button>
      </section>
    </main>
  );
}
