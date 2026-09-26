"use client";

import { RouteError } from "@/components/teacher/route-error";

/**
 * El chat monta su propio marco, así que si falla la carga (p. ej. la lista de
 * módulos) no hay barra lateral: el aviso ocupa la página completa.
 */
export default function ChatError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <RouteError retry={retry} variant="page" />;
}
