import Link from 'next/link';

export default function DocumentNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-900">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold">Documento no disponible</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          El documento no existe, fue eliminado lógicamente o ya no está disponible para tu sesión.
        </p>
        <Link className="mt-5 inline-flex rounded-md bg-sky-700 px-3 py-2 font-semibold text-white" href="/admin/documents">
          Volver a documentos
        </Link>
      </section>
    </main>
  );
}
