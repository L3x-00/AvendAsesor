import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminShell } from "@/components/admin/admin-shell";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";
import { reviewUnansweredQuestionAction } from "../actions";

const reasonLabel: Record<
  "ambiguous_request" | "insufficient_evidence",
  string
> = {
  ambiguous_request: "La consulta requiere mayor precisión",
  insufficient_evidence: "No se encontró sustento suficiente",
};

export default async function OperationsPage() {
  const { access, client } = await createAuthorizedAdminApiContext();
  const [metrics, unansweredQuestions] = await Promise.all([
    client.getOperationalMetrics(),
    client.listUnansweredQuestions("pending_review"),
  ]);

  return (
    <AdminShell
      activeSection="operations"
      description="Revisa indicadores agregados y atiende las consultas que necesitan intervención humana. La administración no modifica el contenido del chat."
      title="Consultas y reportes"
      userName={access.fullName}
      userRole={access.role}
    >
      <section aria-labelledby="operations-metrics-title">
        <h2 className="avend-section-title" id="operations-metrics-title">
          Indicadores actuales
        </h2>
        <dl className="avend-operation-metrics">
          <div>
            <dt>Conversaciones</dt>
            <dd>{metrics.totalConversations}</dd>
          </div>
          <div>
            <dt>Consultas pendientes</dt>
            <dd>{metrics.pendingUnansweredQuestions}</dd>
          </div>
          <div>
            <dt>Consultas resueltas</dt>
            <dd>{metrics.resolvedUnansweredQuestions}</dd>
          </div>
          <div>
            <dt>Trabajos de ingesta pendientes</dt>
            <dd>{metrics.pendingIngestionJobs}</dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="unanswered-title"
        className="avend-operation-section"
      >
        <h2 className="avend-section-title" id="unanswered-title">
          Consultas sin sustento o ambiguas
        </h2>
        <p className="avend-section-description">
          Clasifica la revisión y deja una nota operativa. No se altera la
          conversación original.
        </p>
        {unansweredQuestions.length === 0 ? (
          <p className="avend-content-empty">
            No hay consultas pendientes de revisión.
          </p>
        ) : (
          <ul className="avend-operation-list">
            {unansweredQuestions.map((question) => (
              <li className="avend-operation-item" key={question.id}>
                <p className="avend-operation-item-label">
                  {reasonLabel[question.reason]}
                </p>
                <p className="avend-operation-summary-label">
                  Resumen operativo
                </p>
                <p className="avend-operation-question">{question.question}</p>
                <AdminActionForm
                  action={reviewUnansweredQuestionAction}
                  className="avend-operation-review-form"
                  submitLabel="Guardar revisión"
                >
                  <input name="questionId" type="hidden" value={question.id} />
                  <label htmlFor={`question-category-${question.id}`}>
                    Clasificación
                    <select
                      defaultValue="documentation_gap"
                      id={`question-category-${question.id}`}
                      name="category"
                    >
                      <option value="documentation_gap">
                        Falta documental
                      </option>
                      <option value="module_configuration">
                        Configuración de módulo
                      </option>
                      <option value="outside_scope">Fuera del alcance</option>
                      <option value="duplicate">Duplicada</option>
                      <option value="other">Otra</option>
                    </select>
                  </label>
                  <label htmlFor={`question-decision-${question.id}`}>
                    Decisión
                    <select
                      defaultValue="resolved"
                      id={`question-decision-${question.id}`}
                      name="decision"
                    >
                      <option value="resolved">Marcar como resuelta</option>
                      <option value="dismissed">Descartar de la cola</option>
                    </select>
                  </label>
                  <label htmlFor={`question-note-${question.id}`}>
                    Nota de revisión
                    <textarea
                      id={`question-note-${question.id}`}
                      maxLength={2000}
                      minLength={4}
                      name="reviewNote"
                      required
                      rows={3}
                    />
                  </label>
                </AdminActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
