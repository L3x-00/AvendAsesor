export default function ModulesLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Cargando módulos"
      className="mx-auto w-full max-w-7xl space-y-5 p-5 sm:p-8"
    >
      <div className="h-9 w-64 animate-pulse rounded bg-slate-200" />
      <p className="text-base text-avend-text-muted" role="status">
        Cargando módulos y documentos…
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            aria-hidden="true"
            className="h-40 animate-pulse rounded-xl border border-avend-border bg-slate-100"
            key={index}
          />
        ))}
      </div>
    </main>
  );
}
