"use client";

import { useState } from "react";
import { documentTypeLabel } from "@/lib/admin-api/document-taxonomy";
import type { ChatCatalogDocument } from "@/lib/chat-api/types";
import styles from "./chat-sources.module.css";

const PAGE_SIZE = 10;

function metadata(document: ChatCatalogDocument): string {
  return [
    documentTypeLabel(document.documentType),
    document.resolutionNumber,
    document.issuanceYear ? String(document.issuanceYear) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Catálogo completo elegible, revelado por bloques para corpus grandes. */
export function ChatCatalogDownloads({
  documents,
}: {
  documents: ChatCatalogDocument[];
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  if (!documents.length) return null;
  const visible = documents.slice(0, visibleCount);

  return (
    <section
      aria-label="Archivos del catálogo disponibles para descargar"
      className={styles.downloads}
    >
      <div className={styles.downloadsHeading}>
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="M7 3.75h7L18 7.7v12.55H7z" />
          <path d="M14 3.75V8h4M12.5 11v5m0 0-2-2m2 2 2-2" />
        </svg>
        <div>
          <h2>Archivos disponibles</h2>
          <p>
            {documents.length} {documents.length === 1 ? "archivo" : "archivos"}{" "}
            del catálogo, sin limitarse a las referencias de una respuesta.
          </p>
        </div>
      </div>
      <ul className={styles.downloadList}>
        {visible.map((document) => (
          <li key={document.versionId}>
            <span>
              <strong>{document.title}</strong>
              <small>{metadata(document) || document.originalFileName}</small>
            </span>
            <a
              aria-label={`Descargar ${document.title}`}
              href={`/api/chat/catalog/documents/${encodeURIComponent(document.versionId)}/download`}
              rel="noopener noreferrer"
              target="_blank"
            >
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <path d="M12 3v12m0 0-4-4m4 4 4-4M5 20h14" />
              </svg>
              Descargar
            </a>
          </li>
        ))}
      </ul>
      {visibleCount < documents.length ? (
        <button
          className={styles.showMore}
          onClick={() =>
            setVisibleCount((count) =>
              Math.min(count + PAGE_SIZE, documents.length),
            )
          }
          type="button"
        >
          Ver {Math.min(PAGE_SIZE, documents.length - visibleCount)} archivos
          más
        </button>
      ) : null}
    </section>
  );
}
