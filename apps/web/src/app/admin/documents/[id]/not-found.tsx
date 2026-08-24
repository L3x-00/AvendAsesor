import Link from 'next/link';

export default function DocumentNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-avend-surface-muted px-4 text-avend-text">
      <section className="avend-elevated w-full max-w-md rounded-lg border border-avend-border bg-avend-surface p-6 text-center">
        <h1 className="text-xl font-bold">Documento no disponible</h1>
        <p className="mt-2 text-base leading-6 text-avend-text-muted">
          El documento no existe, fue eliminado lógicamente o ya no está disponible para tu sesión.
        </p>
        <Link className="avend-button avend-button--primary mt-5" href="/admin/documents">
          Volver a documentos
        </Link>
      </section>
    </main>
  );
}
