"use client";

import { useState } from "react";

/**
 * «Cerrar sesión» de Mi perfil. El envío es un POST nativo a /auth/sign-out
 * (la ruta solo acepta POST), así que `useFormStatus` no ve el envío: el
 * estado se marca en `onSubmit` para que el botón responda al instante y no
 * se pulse varias veces con una red lenta.
 */
export function ProfileSignOutButton() {
  const [signingOut, setSigningOut] = useState(false);

  return (
    <form
      action="/auth/sign-out"
      className="avend-profile-sign-out-form"
      method="post"
      onSubmit={(event) => {
        if (signingOut) {
          event.preventDefault();
          return;
        }
        setSigningOut(true);
      }}
    >
      <button
        aria-busy={signingOut || undefined}
        aria-disabled={signingOut || undefined}
        className="avend-button avend-button--secondary avend-profile-sign-out"
        type="submit"
      >
        {signingOut ? "Cerrando sesión…" : "Cerrar sesión"}
      </button>
    </form>
  );
}
