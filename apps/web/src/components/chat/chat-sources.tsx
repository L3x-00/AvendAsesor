import type { ChatSource } from "@/lib/chat-api/types";

interface ChatSourcesProps {
  sources: ChatSource[];
}

export function ChatSources({ sources }: ChatSourcesProps) {
  return (
    <section
      aria-labelledby="chat-sources-title"
      className="avend-chat-sources"
    >
      <h2 id="chat-sources-title">Referencias</h2>
      <div className="avend-chat-sources-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Documento</th>
              <th>Página</th>
              <th>Sección</th>
              <th>Relevancia</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.rank}>
                <td>{source.rank}</td>
                <td>
                  {source.documentTitle}
                  <span>Versión {source.versionNumber}</span>
                </td>
                <td>
                  {source.pageStart === source.pageEnd
                    ? source.pageStart
                    : `${source.pageStart}-${source.pageEnd}`}
                </td>
                <td>
                  {source.sectionTitle ??
                    source.articleReference ??
                    "No especificada"}
                </td>
                <td>{Math.round(source.relevanceScore * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
