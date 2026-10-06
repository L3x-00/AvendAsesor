"use client";

import { useEffect, useId, useRef, useState } from "react";
import { documentTypeLabel } from "@/lib/admin-api/document-taxonomy";
import {
  moduleOverviewSchema,
  type ModuleOverview,
} from "@/lib/chat-api/types";

type OverviewState =
  | { status: "error" }
  | { status: "loading" }
  | { overview: ModuleOverview; status: "ready" };

const SHORT_TITLE_CHARS = 70;
export const AUTO_COLLAPSE_MS = 1_800;

function shortTitle(title: string): string {
  const clean = title
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[.;:]+$/u, "");
  if (clean.length <= SHORT_TITLE_CHARS) return clean;
  const cut = clean.slice(0, SHORT_TITLE_CHARS);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/u, "")}…`;
}

function details(document: ModuleOverview["documents"][number]): string {
  return [
    documentTypeLabel(document.documentType),
    document.resolutionNumber,
    document.issuanceYear ? String(document.issuanceYear) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * «Documentos de este tema»: al abrir un tema del chat, sus documentos con un
 * resumen corto (generado por la IA a partir del texto), para que el docente
 * sepa de qué trata antes de preguntar. Se monta con `key` por tema, así cada
 * tema empieza cargando sin estados cruzados.
 */
export function ModuleOverviewCard({
  disabled,
  moduleId,
  onAsk,
}: {
  disabled?: boolean;
  moduleId: string;
  onAsk: (question: string) => void;
}) {
  const contentId = useId();
  const [isExpanded, setIsExpanded] = useState(false);
  const [state, setState] = useState<OverviewState>({ status: "loading" });
  const autoCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/chat/modules/${moduleId}/overview`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("overview");
        const parsed = moduleOverviewSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error("overview");
        setState({ overview: parsed.data, status: "ready" });
        const reduceMotion =
          window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
          false;
        if (parsed.data.scope !== "empty" && !reduceMotion) {
          setIsExpanded(true);
          autoCollapseTimer.current = setTimeout(() => {
            setIsExpanded(false);
            autoCollapseTimer.current = null;
          }, AUTO_COLLAPSE_MS);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => {
      controller.abort();
      if (autoCollapseTimer.current) {
        clearTimeout(autoCollapseTimer.current);
        autoCollapseTimer.current = null;
      }
    };
  }, [moduleId]);

  const cancelAutoCollapse = () => {
    if (autoCollapseTimer.current) {
      clearTimeout(autoCollapseTimer.current);
      autoCollapseTimer.current = null;
    }
  };

  const toggleSummary = () => {
    cancelAutoCollapse();
    setIsExpanded((current) => !current);
  };

  if (state.status === "error") return null;

  if (state.status === "loading") {
    return (
      <section
        aria-busy="true"
        aria-label="Documentos de este tema"
        className="avend-chat-overview"
      >
        <p className="avend-chat-overview-title">Documentos de este tema</p>
        <p className="avend-chat-overview-loading" role="status">
          Preparando un resumen de los documentos…
        </p>
        <span aria-hidden="true" className="avend-chat-overview-skeleton" />
        <span aria-hidden="true" className="avend-chat-overview-skeleton" />
      </section>
    );
  }

  const { overview } = state;
  const hasSummaries = overview.documents.some((document) => document.summary);
  const visibleCount = overview.documents.length;
  const readyLabel =
    overview.total > visibleCount
      ? `Resumen listo · ${visibleCount} de ${overview.total} documentos`
      : `Resumen listo · ${overview.total} ${overview.total === 1 ? "documento" : "documentos"}`;

  return (
    <section
      aria-label="Documentos de este tema"
      className="avend-chat-overview"
      onFocusCapture={cancelAutoCollapse}
      onPointerEnter={cancelAutoCollapse}
    >
      <p className="avend-chat-overview-title">Documentos de este tema</p>
      {overview.scope === "empty" ? (
        <p className="avend-chat-overview-note">
          Estoy listo para orientarte con este tema. Escribe tu consulta y la
          buscaré en todos los documentos disponibles; si aún falta respaldo, te
          lo diré con claridad.
        </p>
      ) : (
        <>
          <div className="avend-chat-overview-ready">
            <span role="status">{readyLabel}</span>
            <button
              aria-controls={contentId}
              aria-expanded={isExpanded}
              className="avend-chat-overview-toggle"
              onClick={toggleSummary}
              type="button"
            >
              {isExpanded ? "Ocultar resumen" : "Ver resumen"}
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </div>
          <div
            aria-hidden={!isExpanded}
            className="avend-chat-overview-reveal"
            data-open={isExpanded ? "true" : "false"}
            id={contentId}
          >
            <div className="avend-chat-overview-content">
              {overview.scope === "parent" ? (
                <p className="avend-chat-overview-note">
                  Estos son los documentos disponibles sobre «
                  {overview.scopeName}»:
                </p>
              ) : null}
              {hasSummaries ? (
                <p className="avend-chat-overview-foot">
                  Resumen orientativo generado con IA a partir del texto de cada
                  documento. Las respuestas del chat citan la fuente exacta.
                </p>
              ) : null}
              <ul className="avend-chat-overview-list">
                {overview.documents.map((document) => (
                  <li key={document.id}>
                    <p className="avend-chat-overview-doc">{document.title}</p>
                    {details(document) ? (
                      <p className="avend-chat-overview-meta">
                        {details(document)}
                      </p>
                    ) : null}
                    {document.summary ? (
                      <p className="avend-chat-overview-summary">
                        {document.summary}
                      </p>
                    ) : null}
                    <button
                      aria-label={`Preguntar sobre este documento: ${shortTitle(document.title)}`}
                      className="avend-chat-overview-ask"
                      disabled={disabled || !isExpanded}
                      onClick={() =>
                        onAsk(`¿Qué establece «${shortTitle(document.title)}»?`)
                      }
                      type="button"
                    >
                      Preguntar sobre este documento
                    </button>
                  </li>
                ))}
              </ul>
              {overview.total > overview.documents.length ? (
                <p className="avend-chat-overview-note">
                  Y {overview.total - overview.documents.length} documentos más
                  en este tema: pregúntame por ellos en el chat.
                </p>
              ) : null}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
