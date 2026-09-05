import type { ChatSource } from "@/lib/chat-api/types";
import styles from "./chat-sources.module.css";

interface ChatSourcesProps {
  sources: ChatSource[];
}

function pageRange(source: ChatSource): string {
  return source.pageStart === source.pageEnd
    ? `${source.pageStart}`
    : `${source.pageStart}–${source.pageEnd}`;
}

function situationLabel(source: ChatSource): string {
  switch (source.documentSituation) {
    case "current":
      return "Vigente";
    case "replaced":
      return "Reemplazado / sin vigencia · Histórico";
    case "archived":
      return "Archivado · Antecedente histórico";
  }
}

export function ChatSources({ sources }: ChatSourcesProps) {
  return (
    <section
      aria-label="Referencias verificables"
      className="avend-chat-sources"
    >
      <header className={styles.heading}>
        <div>
          <h2>Referencias</h2>
          <p>Documentos que sustentan esta respuesta.</p>
        </div>
        <span className={styles.count}>
          {sources.length} {sources.length === 1 ? "fuente" : "fuentes"}
        </span>
      </header>

      <div
        aria-label="Tabla de referencias documentales"
        className={styles.tableViewport}
        role="region"
        tabIndex={0}
      >
        <table className={styles.table}>
          <caption className={styles.caption}>
            Fuentes documentales, ubicación y descarga
          </caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Documento</th>
              <th scope="col">Referencia</th>
              <th scope="col">Página</th>
              <th scope="col">Versión</th>
              <th scope="col">Acción</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => {
              const downloadPath = `/api/chat/sources/${encodeURIComponent(source.id)}/download`;

              return (
                <tr key={source.id}>
                  <td data-label="#">
                    <span className={styles.mobileCellLabel}>
                      Fuente número:{" "}
                    </span>
                    <span className={styles.rank}>{source.rank}</span>
                  </td>
                  <td data-label="Documento">
                    <strong className={styles.documentTitle}>
                      {source.documentTitle}
                    </strong>
                    <span className={styles.documentMeta}>
                      Proceso: {source.moduleName ?? "No especificado"}
                    </span>
                    <span className={styles.documentMeta}>
                      Situación: <strong>{situationLabel(source)}</strong>
                    </span>
                    <span className={styles.documentMeta}>
                      Coincidencia documental:{" "}
                      {Math.round(source.relevanceScore * 100)}%
                    </span>
                  </td>
                  <td data-label="Referencia">
                    <span className={styles.referenceLine}>
                      <strong>Sección:</strong>{" "}
                      {source.sectionTitle ?? "No especificada"}
                    </span>
                    <span className={styles.referenceLine}>
                      <strong>Artículo:</strong>{" "}
                      {source.articleReference ?? "No especificado"}
                    </span>
                    <span className={styles.referenceLine}>
                      <strong>Numeral:</strong>{" "}
                      {source.numeralReference ?? "No especificado"}
                    </span>
                  </td>
                  <td
                    data-label={
                      source.pageStart === source.pageEnd ? "Página" : "Páginas"
                    }
                  >
                    <span className={styles.mobileCellLabel}>
                      {source.pageStart === source.pageEnd
                        ? "Página: "
                        : "Páginas: "}
                    </span>
                    {pageRange(source)}
                  </td>
                  <td data-label="Versión">
                    <span className={styles.mobileCellLabel}>Versión: </span>
                    {source.versionNumber}
                  </td>
                  <td data-label="Acción">
                    <a
                      aria-label={`Abrir fuente [${source.rank}]: ${source.documentTitle} (se abre en una pestaña nueva)`}
                      className={styles.sourceLink}
                      href={downloadPath}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <svg
                        aria-hidden="true"
                        className={styles.linkIcon}
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <path d="M14 4h6v6M20 4l-9 9" />
                        <path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
                      </svg>
                      Ver documento
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
