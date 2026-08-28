import Link from "next/link";

export default function OrientationNotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-2xl place-content-center gap-4 px-5 py-12 text-center">
      <p className="avend-eyebrow">Ficha no disponible</p>
      <h1 className="text-3xl font-bold text-avend-navy">
        No es posible preparar este documento
      </h1>
      <p className="text-base leading-7 text-avend-text-muted">
        La ficha solo puede generarse desde una respuesta completada y respaldada
        por al menos una fuente verificable de tu propia conversación.
      </p>
      <Link className="avend-button avend-button--primary mx-auto" href="/chat">
        Volver al chat
      </Link>
    </main>
  );
}
