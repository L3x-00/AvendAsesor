"use client";

import Image from "next/image";
import { useId, useState } from "react";
import type { ChatModule } from "@/lib/chat-api/types";

/**
 * Carpeta de temas estable y accesible. Los subtemas describen el alcance del
 * módulo elegido; no restringen la consulta ni se pueden seleccionar.
 */
export function SubmoduleFolder({
  disabled,
  moduleName,
  submodules,
}: {
  disabled?: boolean;
  moduleName: string;
  submodules: ChatModule[];
}) {
  const contentId = useId();
  const [isOpen, setIsOpen] = useState(true);

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
          <span className="avend-chat-topic-folder-back" />
          <span className="avend-chat-topic-folder-paper" />
          <span className="avend-chat-topic-folder-front" />
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
            Este tema incluye los siguientes procesos. Puedes preguntar sobre
            cualquiera de ellos sin seleccionarlo primero.
          </p>
          <ul className="avend-chat-submodules">
            {submodules.map((submodule, index) => (
              <li
                className="avend-chat-submodule-tag"
                key={submodule.id}
                style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
              >
                <span aria-hidden="true" className="avend-chat-module-icon">
                  <Image
                    alt=""
                    height={24}
                    src="/files.svg"
                    unoptimized
                    width={24}
                  />
                </span>
                <span className="avend-chat-module-name">
                  {submodule.name}
                </span>
              </li>
            ))}
          </ul>
          {submodules.length === 0 ? (
            <p className="avend-chat-topic-empty" role="status">
              No encontramos temas con ese nombre.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
