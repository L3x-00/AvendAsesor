import type { ChatSource } from "@/lib/chat-api/types";
import styles from "./chat-sources.module.css";

interface ChatSourcesProps {
  sources: ChatSource[];
}

export function ChatSources({ sources }: ChatSourcesProps) {
  return (
    <section aria-label="Referencias verificables" className="avend-chat-sources">
      <h2>Referencias</h2>
      <ol className={styles.list}>
        {sources.map((source) => {
          const downloadPath = `/api/chat/sources/${encodeURIComponent(source.id)}/download`;

          return (
            <li className={styles.item} key={source.id}>
              <a
                aria-label={`Abrir fuente [${source.rank}]: ${source.documentTitle} (se abre en una pestaña nueva)`}
                className={styles.sourceLink}
                href={downloadPath}
                rel="noopener noreferrer"
                target="_blank"
              >
                <span aria-hidden="true" className={styles.marker}>
                  [{source.rank}]
                </span>
                <span>{source.documentTitle}</span>
                <span aria-hidden="true" className={styles.externalIcon}>
                  ↗
                </span>
              </a>

              <dl className={styles.metadata}>
                <div>
                  <dt>
                    {source.pageStart === source.pageEnd ? "Página" : "Páginas"}
                  </dt>
                  <dd>
                    {source.pageStart === source.pageEnd
                      ? source.pageStart
                      : `${source.pageStart}–${source.pageEnd}`}
                  </dd>
                </div>
                <div>
                  <dt>Versión</dt>
                  <dd>{source.versionNumber}</dd>
                </div>
                <div>
                  <dt>Proceso</dt>
                  <dd>{source.moduleName ?? "No especificado"}</dd>
                </div>
                <div>
                  <dt>Sección</dt>
                  <dd>{source.sectionTitle ?? "No especificada"}</dd>
                </div>
                <div>
                  <dt>Artículo</dt>
                  <dd>{source.articleReference ?? "No especificado"}</dd>
                </div>
                <div>
                  <dt>Numeral</dt>
                  <dd>{source.numeralReference ?? "No especificado"}</dd>
                </div>
              </dl>

              <p className={styles.relevance}>
                Coincidencia documental: {Math.round(source.relevanceScore * 100)}%
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
