"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { EmailChangeOutcome } from "@/lib/auth/site-url";

interface EmailChangeNoticeProps {
  /** Correo de acceso vigente, leído de Auth al pintar la página. */
  email: string;
  outcome: EmailChangeOutcome | null;
}

function noticeCopy(outcome: EmailChangeOutcome, email: string): { text: string; title: string } {
  switch (outcome) {
    case "actualizado":
      return {
        text: email
          ? `Tu correo de acceso ahora es ${email}. Úsalo la próxima vez que inicies sesión.`
          : "Úsalo la próxima vez que inicies sesión.",
        title: "Listo: cambiaste tu correo",
      };
    case "pendiente":
      return {
        text: "Confirmaste uno de los enlaces. Abre también el enlace que llegó al otro correo para terminar el cambio.",
        title: "Falta un paso",
      };
    case "revisar":
      return {
        text: "Si abriste el enlace en otro dispositivo o navegador, el cambio pudo completarse igual. Tu correo de acceso actual se muestra abajo; si sigue siendo el anterior, vuelve a solicitar el cambio.",
        title: "Revisa tu correo de acceso",
      };
    case "error":
      return {
        text: "El enlace venció, ya se usó o no es válido. Si tu correo de acceso no cambió (se muestra abajo), vuelve a solicitar el cambio.",
        title: "No pudimos usar ese enlace",
      };
  }
}

/**
 * Aviso del resultado del cambio de correo (`/profile?correo=…`). Se muestra
 * una sola vez: al montarse quita el parámetro de la URL para que recargar o
 * compartir la página no repita un aviso antiguo, y conserva el texto en su
 * propio estado hasta que la persona lo cierra.
 */
export function EmailChangeNotice({ email, outcome }: EmailChangeNoticeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [shown, setShown] = useState(() =>
    outcome ? { ...noticeCopy(outcome, email), outcome } : null,
  );

  useEffect(() => {
    if (outcome) router.replace(pathname, { scroll: false });
  }, [outcome, pathname, router]);

  if (!shown) return null;

  const tone = shown.outcome === "actualizado" ? "success" : shown.outcome === "error" ? "error" : "info";

  return (
    <div
      className={`avend-profile-notice avend-profile-notice--${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <div>
        <p className="avend-profile-notice-title">{shown.title}</p>
        <p>{shown.text}</p>
      </div>
      <button
        className="avend-button avend-button--secondary avend-profile-notice-close"
        onClick={() => setShown(null)}
        type="button"
      >
        Cerrar aviso
      </button>
    </div>
  );
}
