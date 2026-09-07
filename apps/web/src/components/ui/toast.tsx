"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Avisos emergentes del sistema.
 *
 * Existe uno solo para todo AVEND: la confirmación de guardado tiene que verse
 * igual y en el mismo sitio en el panel administrativo y en el docente, o deja
 * de leerse como una confirmación y pasa a leerse como un elemento más de la
 * pantalla.
 *
 * No bloquea la interfaz y se retira solo. Para quien usa lector de pantalla se
 * anuncia por una región viva; el aviso de error usa `alert` porque interrumpe,
 * y el de éxito `status` porque no debe interrumpir lo que se esté leyendo.
 */

export type ToastTone = "error" | "success";

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Suficiente para leer una frase corta sin que estorbe la siguiente acción. */
const TOAST_LIFETIME_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (message: string, tone: ToastTone = "success") => {
      const trimmed = message.trim();
      if (!trimmed) return;

      nextId.current += 1;
      const id = nextId.current;
      setToasts((current) => [...current, { id, message: trimmed, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TOAST_LIFETIME_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="avend-toast-region">
        {toasts.map((toast) => (
          <output
            className={`avend-toast avend-toast--${toast.tone}`}
            key={toast.id}
          >
            <ToastIcon tone={toast.tone} />
            <span className="avend-toast-text">{toast.message}</span>
            <button
              aria-label="Cerrar aviso"
              className="avend-toast-close"
              onClick={() => dismiss(toast.id)}
              type="button"
            >
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </output>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastIcon({ tone }: { tone: ToastTone }) {
  return (
    <svg
      aria-hidden="true"
      className="avend-toast-icon"
      fill="none"
      viewBox="0 0 24 24"
    >
      {tone === "success" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12.5 2.5 2.5L16 9.5" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v5.5M12 16.2v.3" />
        </>
      )}
    </svg>
  );
}

/**
 * Devuelve un emisor inerte cuando no hay proveedor. Un formulario colocado
 * fuera del proveedor debe seguir guardando; perder el aviso es preferible a
 * romper el envío.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  const fallback = useMemo<ToastContextValue>(
    () => ({ showToast: () => undefined }),
    [],
  );
  return context ?? fallback;
}
