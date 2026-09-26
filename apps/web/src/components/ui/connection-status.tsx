"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

function subscribeToConnection(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

const readOnline = () => window.navigator.onLine;
/** En el servidor se asume conexión: el aviso nunca nace visible por error. */
const readServerOnline = () => true;

/** El aviso de "conexión restablecida" se retira solo tras este tiempo. */
export const RESTORED_NOTICE_MS = 4_000;

/**
 * Aviso global de conexión a internet.
 *
 * - Al perder la red aparece una franja fija y amable que dice qué pasó y que
 *   no se pierde nada; queda visible mientras dure el corte.
 * - Al volver, confirma "Conexión restablecida" unos segundos y desaparece.
 *
 * Se apoya en los eventos `online`/`offline` del navegador. No interrumpe:
 * no bloquea la pantalla ni roba el foco.
 */
export function ConnectionStatus() {
  // Si la página ya abrió sin red, el aviso aparece desde el inicio.
  const online = useSyncExternalStore(
    subscribeToConnection,
    readOnline,
    readServerOnline,
  );
  const [restored, setRestored] = useState(false);
  const restoreTimer = useRef<number | null>(null);

  useEffect(() => {
    function clearRestoreTimer() {
      if (restoreTimer.current !== null) {
        window.clearTimeout(restoreTimer.current);
        restoreTimer.current = null;
      }
    }

    function handleOffline() {
      clearRestoreTimer();
      setRestored(false);
    }

    function handleOnline() {
      clearRestoreTimer();
      setRestored(true);
      restoreTimer.current = window.setTimeout(
        () => setRestored(false),
        RESTORED_NOTICE_MS,
      );
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      clearRestoreTimer();
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  const state = !online ? "offline" : restored ? "restored" : "online";

  return (
    <div className="avend-connection-region" aria-live="polite" role="status">
      {state === "offline" ? (
        <div className="avend-connection avend-connection--offline">
          <span aria-hidden="true" className="avend-connection-icon">
            <svg fill="none" viewBox="0 0 24 24">
              <path d="M3 3l18 18" />
              <path d="M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4.2-2.3M19 12.5a10 10 0 0 0-2.5-1.7M2 8.8a15 15 0 0 1 4.3-2.5M22 8.8A15 15 0 0 0 11 5" />
              <path d="M12 20h.01" />
            </svg>
          </span>
          <div>
            <strong>Sin conexión a internet</strong>
            <p>
              Revisa tu red. No se pierde nada de lo que escribiste; podrás
              continuar apenas vuelva la conexión.
            </p>
          </div>
        </div>
      ) : null}
      {state === "restored" ? (
        <div className="avend-connection avend-connection--restored">
          <span aria-hidden="true" className="avend-connection-icon">
            <svg fill="none" viewBox="0 0 24 24">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </span>
          <div>
            <strong>Conexión restablecida</strong>
            <p>Ya puedes continuar.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
