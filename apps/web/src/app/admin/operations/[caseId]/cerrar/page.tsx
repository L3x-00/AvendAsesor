import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminPage } from "@/components/admin/admin-page";
import { FieldError } from "@/components/ui/form-field";
import styles from "@/components/admin/consultation-reports.module.css";
import { createAuthorizedConsultationReportsApiContext } from "@/lib/consultation-reports-api/authorized-client";
import { ConsultationReportsApiError } from "@/lib/consultation-reports-api/client";
import { closeConsultationCaseAction } from "../../consultation-actions";

const statusLabels = {
  pending: "Pendiente",
  in_review: "En revisión",
  resolved: "Resuelto",
  discarded: "Descartado",
} as const;

/**
 * Cierre de consulta en pantalla propia: el resultado y la nota se guardan sin
 * desplegar nada debajo de la tarjeta del caso.
 */
export default async function CloseConsultationCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const { client } = await createAuthorizedConsultationReportsApiContext();
  let detail;
  try {
    detail = await client.getCase(caseId);
  } catch (error) {
    if (error instanceof ConsultationReportsApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const caseData = detail.case;

  return (
    <AdminPage
      description="Cierra la consulta con su resultado. La decisión queda registrada en el historial del caso."
      title="Cerrar consulta"
    >
      <main className={styles.page}>
        <Link className={styles.backLink} href={`/admin/operations/${caseId}`}>
          ‹ Volver al caso
        </Link>

        <section
          aria-labelledby="close-case-title"
          className={styles.section}
        >
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.detailTitle} id="close-case-title">
                Cerrar consulta
              </h2>
              <p className={styles.description}>
                Estado actual: <strong>{statusLabels[caseData.status]}</strong>.
                Elige el resultado y, si lo necesitas, deja una nota de cierre.
              </p>
            </div>
          </div>

          <div className={styles.detailGrid}>
            <section className={styles.detailBlock}>
              <h3>Consulta original</h3>
              <p className={styles.caseText}>
                {caseData.questionSnapshot ??
                  "No hay una consulta asociada a este caso."}
              </p>
            </section>
            <section className={styles.detailBlock}>
              <h3>Respuesta del asistente</h3>
              <p className={styles.caseText}>
                {caseData.answerSnapshot ??
                  "No hay una respuesta registrada para este caso."}
              </p>
            </section>
          </div>

          <AdminActionForm
            action={closeConsultationCaseAction}
            className={styles.compactForm}
            rules={{
              note: [
                { kind: "maxLength", label: "La nota de cierre", max: 2000 },
              ],
            }}
            submitLabel="Cerrar consulta"
          >
            <input name="caseId" type="hidden" value={caseId} />
            <div className={styles.formGrid}>
              <label htmlFor="close-status">
                Resultado
                <select
                  defaultValue="resolved"
                  id="close-status"
                  name="status"
                  required
                >
                  <option value="resolved">
                    Resuelta (documentación cargada o caso atendido)
                  </option>
                  <option value="discarded">
                    Descartada (prueba, duplicado o sin acción necesaria)
                  </option>
                </select>
              </label>
              <label htmlFor="close-note">
                Nota de cierre
                <textarea
                  id="close-note"
                  maxLength={2000}
                  name="note"
                  rows={3}
                />
                <FieldError name="note" />
              </label>
            </div>
          </AdminActionForm>

          <p className={styles.meta}>
            <Link href={`/admin/operations/${caseId}`}>
              Cancelar y volver al caso
            </Link>
          </p>
        </section>
      </main>
    </AdminPage>
  );
}
