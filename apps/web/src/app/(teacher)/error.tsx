"use client";

import { RouteError } from "@/components/teacher/route-error";

/**
 * Límite de error de Historial, Guía y Perfil. Vive dentro del layout, así que
 * la barra lateral sigue disponible para moverse a otra sección.
 */
export default function TeacherSectionError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <RouteError retry={retry} />;
}
