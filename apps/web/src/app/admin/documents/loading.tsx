export default function DocumentsLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Cargando documentos"
      className="mx-auto w-full max-w-7xl space-y-5 p-5 sm:p-8"
    >
      <div className="h-9 w-72 animate-pulse rounded bg-slate-200" />
      <p className="text-base text-avend-text-muted" role="status">
        Cargando biblioteca documental…
      </p>
      <div
        aria-hidden="true"
        className="h-64 animate-pulse rounded-xl border border-avend-border bg-slate-100"
      />
    </main>
  );
}
