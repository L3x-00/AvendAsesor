"use client";

import { RouteError } from "@/components/teacher/route-error";

/**
 * Último recurso para cualquier ruta sin límite propio (incluido un fallo del
 * layout docente, que su propio `error.tsx` no puede atrapar).
 */
export default function AppError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <RouteError retry={retry} variant="page" />;
}
