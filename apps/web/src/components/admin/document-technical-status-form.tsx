import { setDocumentTechnicalStatusAction } from "@/app/admin/actions";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import type {
  ManagedDocumentDetails,
  ManagedDocumentVersion,
} from "@/lib/admin-api/types";

interface DocumentTechnicalStatusFormProps {
  approvalStatus: ManagedDocumentDetails["approvalStatus"];
  approvedVersionId: string | null;
  currentIngestionStatus: ManagedDocumentVersion["ingestionStatus"] | undefined;
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
  const queued =
    currentIngestionStatus === "pending" ||
    currentIngestionStatus === "processing";
  // Con una versión nueva aún sin indexar, «Listo» queda deshabilitado: no se
  // preselecciona, porque una opción deshabilitada no se envía al guardar.
  const selected = indexed ? approvalStatus : "pending_approval";

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
          defaultValue={selected}
          id="technical-status"
          key={`${selected}-${approvedVersionId ?? "sin-aprobar"}`}
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
      {queued ? (
        // Tras «Volver a procesar» la ficha pasa a este bloque: el aviso
        // confirma que el documento quedó en cola aunque el formulario de
        // reintento ya no esté en pantalla.
        <p
          className="rounded-md border border-blue-300 bg-blue-50 p-3 text-base text-blue-900"
          role="status"
        >
          El documento está en la cola de lectura e indexación. Actualiza la
          página en unos minutos para ver si ya se puede aprobar como Listo.
        </p>
      ) : null}
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
