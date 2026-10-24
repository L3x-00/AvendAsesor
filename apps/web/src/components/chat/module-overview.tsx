"use client";

import { useEffect } from "react";

/**
 * Prepara en segundo plano el contexto del tema para el RAG. No muestra el
 * resumen ni los documentos: el tema ya queda visible como seleccionado.
 */
export function ModuleOverviewCard({ moduleId }: { moduleId: string }) {
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve(
      fetch(`/api/chat/modules/${encodeURIComponent(moduleId)}/overview`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      }),
    ).catch(() => undefined);
    return () => controller.abort();
  }, [moduleId]);

  return null;
}
