"use client";

import { useId, useMemo, useState } from "react";
import type { ChatModule } from "@/lib/chat-api/types";

const SEARCH_THRESHOLD = 12;

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("es");
}

/**
 * Carpeta de temas estable y accesible. Conserva la metáfora solicitada sin
 * física, arrastre ni interacción dependiente de hover, y escala mediante un
 * filtro local cuando el módulo tiene muchos subtemas.
 */
export function SubmoduleFolder({
  disabled,
  moduleName,
  onSelect,
  selectedModuleId,
  submodules,
}: {
  disabled?: boolean;
  moduleName: string;
  onSelect: (moduleId: string) => void;
  selectedModuleId?: string;
  submodules: ChatModule[];
}) {
  const contentId = useId();
  const [isOpen, setIsOpen] = useState(Boolean(selectedModuleId));
  const [query, setQuery] = useState("");
  const visibleSubmodules = useMemo(() => {
    const term = normalized(query.trim());
    if (!term) return submodules;
    return submodules.filter((submodule) =>
      normalized(submodule.name).includes(term),
    );
  }, [query, submodules]);

  return (
    <section
      aria-label={`Temas de ${moduleName}`}
      className="avend-chat-topic-folder"
    >
      <button
        aria-label={`${isOpen ? "Ocultar temas" : "Mostrar temas"}. ${submodules.length} ${submodules.length === 1 ? "tema" : "temas"}`}
        aria-controls={contentId}
        aria-expanded={isOpen}
        className="avend-chat-topic-folder-toggle"
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span aria-hidden="true" className="avend-chat-topic-folder-icon">
          <svg fill="none" viewBox="0 0 24 24">
            <path d="M3.75 7.25h5l1.7 2h9.8v8.5a2 2 0 0 1-2 2H5.75a2 2 0 0 1-2-2z" />
            <path d="M3.75 9.25v-3a2 2 0 0 1 2-2H9l1.7 2h5.55a2 2 0 0 1 2 2v1" />
          </svg>
        </span>
        <span className="avend-chat-topic-folder-copy">
          <strong>{isOpen ? "Ocultar temas" : "Mostrar temas"}</strong>
          <span>
            {submodules.length} {submodules.length === 1 ? "tema" : "temas"}
          </span>
        </span>
        <svg
          aria-hidden="true"
          className="avend-chat-topic-folder-chevron"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div
        aria-hidden={!isOpen}
        className="avend-chat-topic-folder-reveal"
        data-open={isOpen ? "true" : "false"}
        id={contentId}
      >
        <div className="avend-chat-topic-folder-content">
          <p className="avend-chat-submodules-label">
            Elige un tema si ayuda a precisar tu consulta. También puedes
            escribir directamente.
          </p>
          {submodules.length >= SEARCH_THRESHOLD ? (
            <label className="avend-chat-topic-search">
              <span>Buscar un tema</span>
              <input
                disabled={disabled || !isOpen}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Escribe una palabra"
                type="search"
                value={query}
              />
            </label>
          ) : null}
          <div className="avend-chat-submodules">
            {visibleSubmodules.map((submodule) => (
              <button
                aria-pressed={submodule.id === selectedModuleId}
                className="avend-chat-module"
                disabled={disabled || !isOpen}
                key={submodule.id}
                onClick={() => onSelect(submodule.id)}
                type="button"
              >
                <span aria-hidden="true" className="avend-chat-module-icon">
                  <svg fill="none" viewBox="0 0 24 24">
                    <path d="M7 3.75h7L18 7.7v12.55H7z" />
                    <path d="M14 3.75V8h4M10 12h5M10 15.5h5" />
                  </svg>
                </span>
                <span className="avend-chat-module-name">
                  {submodule.name}
                </span>
              </button>
            ))}
          </div>
          {visibleSubmodules.length === 0 ? (
            <p className="avend-chat-topic-empty" role="status">
              No encontramos temas con ese nombre.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
