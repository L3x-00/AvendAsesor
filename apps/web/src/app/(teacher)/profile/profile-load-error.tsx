"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * Se muestra en lugar de los formularios cuando no se pudieron leer los datos
 * guardados. Un formulario vacío invitaría a guardar y borraría el celular,
 * el departamento y la ciudad que ya existían. «Volver a cargar» pide otra vez
 * los datos al servidor sin recargar toda la página.
 */
export function ProfileLoadError() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="avend-profile-notice avend-profile-notice--error avend-profile-load-error" role="alert">
      <div>
        <p className="avend-profile-notice-title">No pudimos cargar tus datos</p>
        <p>
          Para no guardar campos vacíos por error, ocultamos el formulario hasta poder leer tu
          información. Vuelve a intentarlo en unos segundos.
        </p>
      </div>
      <button
        aria-busy={pending || undefined}
        className="avend-button avend-button--secondary avend-profile-notice-close"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
        type="button"
      >
        {pending ? "Cargando…" : "Volver a cargar"}
      </button>
    </div>
  );
}
