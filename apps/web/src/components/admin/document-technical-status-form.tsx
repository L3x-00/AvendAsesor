import { setDocumentTechnicalStatusAction } from "@/app/admin/actions";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import type { ManagedDocumentDetails } from "@/lib/admin-api/types";

interface DocumentTechnicalStatusFormProps {
  approvalStatus: ManagedDocumentDetails["approvalStatus"];
  approvedVersionId: string | null;
  currentIngestionStatus: string | undefined;
  documentId: string;
}

/**
 * Cambio manual del estado técnico (Pendiente de aprobación ↔ Listo).
 *
 * Tras guardar, el formulario se reinicia a los valores por defecto de sus
 * campos, y React no actualiza el valor por defecto de un <select> ya montado.
 * Por eso, tras pasar a «Listo», la lista volvía a mostrar «Pendiente de
 * aprobación» aunque el cambio estaba guardado. La `key` vuelve a montar la
 * lista cada vez que cambia el estado guardado, con el valor nuevo.
 */
export function DocumentTechnicalStatusForm({
  approvalStatus,
  approvedVersionId,
  currentIngestionStatus,
  documentId,
}: DocumentTechnicalStatusFormProps) {
  const indexed = currentIngestionStatus === "indexed";

  return (
    <AdminActionForm
      action={setDocumentTechnicalStatusAction}
      className="mt-4 space-y-3"
      submitLabel="Guardar estado técnico"
    >
      <input name="documentId" type="hidden" value={documentId} />
      <label className="block" htmlFor="technical-status">
        <span className="text-base font-semibold">Estado</span>
        <select
          className="mt-1 min-h-11 w-full rounded-md border border-avend-border px-3 text-base"
          defaultValue={approvalStatus}
          id="technical-status"
          key={`${approvalStatus}-${approvedVersionId ?? "sin-aprobar"}`}
          name="technicalStatus"
        >
          <option value="pending_approval">Pendiente de aprobación</option>
          <option disabled={!indexed} value="ready">
            Listo (disponible para consultas)
          </option>
          <option disabled value="error">
            Error (solo automático)
          </option>
        </select>
      </label>
      {!indexed ? (
        <p className="text-base text-avend-text-muted">
          Para aprobarla como Listo, la versión debe estar indexada. Si el
          procesamiento automático no está activo o aún no termina, permanecerá
          en Pendiente.
        </p>
      ) : null}
    </AdminActionForm>
  );
}
