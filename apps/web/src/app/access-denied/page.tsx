import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold tracking-wide text-rose-700">
          AVEND ASESOR
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          Acceso restringido
        </h1>
        <p className="mt-3 leading-6 text-slate-600">
          Tu cuenta no tiene permisos administrativos.
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-sky-700 px-4 py-2 font-semibold text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          href="/"
        >
          Volver al inicio
        </Link>
      </section>
    </main>
  );
}
