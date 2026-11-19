"use client";

import type { ChatModule } from "@/lib/chat-api/types";

/**
 * Temas que abarca el módulo elegido. Se muestran como una fila de fichas
 * informativas: describen el alcance de la consulta y no se seleccionan, así
 * que no agregan pasos ni altura al formulario.
 */
export function SubmoduleFolder({
  moduleName,
  submodules,
}: {
  moduleName: string;
  submodules: ChatModule[];
}) {
  return (
    <section
      aria-label={`Temas de ${moduleName}`}
      className="avend-chat-topic-folder"
    >
      <ul className="avend-chat-submodules">
        {submodules.map((submodule, index) => (
          <li
            className="avend-chat-submodule-tag"
            key={submodule.id}
            style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
          >
            <span aria-hidden="true" className="avend-chat-submodule-icon">
              <svg fill="none" viewBox="0 0 24 24">
                <path d="M3.5 8.25V6.4a1.9 1.9 0 0 1 1.9-1.9h3.3l1.9 2.1h8.5a1.9 1.9 0 0 1 1.9 1.9v8.9a1.9 1.9 0 0 1-1.9 1.9H5.4a1.9 1.9 0 0 1-1.9-1.9V8.25Z" />
              </svg>
            </span>
            <span className="avend-chat-module-name">{submodule.name}</span>
          </li>
        ))}
      </ul>
      {submodules.length === 0 ? (
        <p className="avend-chat-topic-empty" role="status">
          No encontramos temas con ese nombre.
        </p>
      ) : null}
    </section>
  );
}
