import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 text-slate-900">
      <section className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
        <p className="text-sm font-semibold tracking-wide text-sky-700">
          AVEND ASESOR
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Plataforma de acompañamiento para docentes
        </h1>
        <p className="mt-4 max-w-xl leading-7 text-slate-600">
          La base de autenticación está preparada para registro, confirmación de correo,
          inicio de sesión y recuperación de contraseña.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-sky-700 px-4 py-2 font-semibold text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            href="/auth/sign-up"
          >
            Crear cuenta
          </Link>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            href="/auth/sign-in"
          >
            Iniciar sesión
          </Link>
        </div>
        <form action="/auth/sign-out" className="mt-8" method="post">
          <button
            className="text-sm font-medium text-slate-600 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            type="submit"
          >
            Cerrar sesión en este dispositivo
          </button>
        </form>
      </section>
    </main>
  );
}
