import { TeacherShell } from "@/components/teacher/teacher-shell";
import { createAuthorizedChatApiClient } from "@/lib/chat-api/authorized-client";

export default async function GuidePage() {
  const client = await createAuthorizedChatApiClient();
  const modules = await client.listModules();

  return (
    <TeacherShell activeSection="guide" modules={modules}>
      <article
        aria-labelledby="guide-title"
        className="avend-content-page avend-guide-page"
      >
        <header className="avend-content-header">
          <p className="avend-eyebrow">Acompañamiento</p>
          <h1 id="guide-title">Guía de uso</h1>
          <p>
            La plataforma está diseñada para ayudarte a ubicar el tema y
            conservar el sustento de cada consulta.
          </p>
        </header>
        <ol>
          <li>
            <strong>Elige un tema si lo deseas.</strong> Puedes seleccionar un
            módulo o escribir directamente tu consulta.
          </li>
          <li>
            <strong>Formula una pregunta concreta.</strong> Incluye el contexto
            necesario, sin compartir información personal innecesaria.
          </li>
          <li>
            <strong>Revisa el sustento.</strong> Cuando exista una respuesta
            respaldada, sus referencias se mostrarán debajo.
          </li>
          <li>
            <strong>Continúa desde el historial.</strong> Tus conversaciones
            solo son visibles desde tu propia cuenta.
          </li>
        </ol>
      </article>
    </TeacherShell>
  );
}
