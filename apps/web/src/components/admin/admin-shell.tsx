import Link from 'next/link';
import type { ReactNode } from 'react';

interface AdminShellProps {
  children: ReactNode;
  description: string;
  title: string;
}

export function AdminShell({ children, description, title }: AdminShellProps) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto w-full max-w-6xl">
        <header className="border-b border-slate-200 pb-5">
          <p className="text-sm font-semibold tracking-wide text-sky-700">
            AVEND ASESOR
          </p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                {description}
              </p>
            </div>
            <nav aria-label="Administración" className="flex flex-wrap gap-2 text-sm">
              <Link
                className="rounded-md border border-slate-300 px-3 py-2 font-semibold hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                href="/admin"
              >
                Inicio
              </Link>
              <Link
                className="rounded-md border border-slate-300 px-3 py-2 font-semibold hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                href="/admin/modules"
              >
                Módulos
              </Link>
              <Link
                className="rounded-md border border-slate-300 px-3 py-2 font-semibold hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                href="/admin/documents"
              >
                Documentos
              </Link>
            </nav>
          </div>
        </header>
        <div className="py-6">{children}</div>
      </div>
    </main>
  );
}
