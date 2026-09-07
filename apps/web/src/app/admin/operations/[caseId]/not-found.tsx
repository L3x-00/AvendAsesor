import Link from "next/link";

export default function ConsultationCaseNotFound() {
  return (
    <main className="p-6">
      <h1 className="text-xl font-bold">Caso no disponible</h1>
      <p className="mt-2 text-base text-avend-text-muted">
        El caso no existe o ya no está disponible para tu cuenta.
      </p>
      <Link
        className="mt-4 inline-flex text-base font-semibold text-avend-accent-strong underline"
        href="/admin/operations"
      >
        Volver a Consultas y reportes
      </Link>
    </main>
  );
}
