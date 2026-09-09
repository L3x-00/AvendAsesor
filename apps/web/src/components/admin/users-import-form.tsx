"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { FieldError } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { ValidatedForm } from "@/components/ui/validated-form";
import type { FieldErrors, FieldRules } from "@/lib/ui/field-validation";
import styles from "./users-manager.module.css";

/** Matches the ceiling the API enforces for one roster. */
export const MAX_USER_IMPORT_BYTES = 2 * 1024 * 1024;

const IMPORT_RULES: FieldRules = {
  file: [
    { kind: "required", label: "El archivo Excel" },
    { kind: "file", label: "El archivo Excel", accept: [".xlsx"], maxBytes: MAX_USER_IMPORT_BYTES },
  ],
};

interface ImportRowError {
  email: string | null;
  message: string;
  rowNumber: number;
}

interface ImportReport {
  considered: number;
  errors: ImportRowError[];
  imported: number;
  truncated: boolean;
}

interface UsersImportFormProps {
  apiBaseUrl: string;
}

function importErrorMessage(status: number): string {
  if (status === 401) {
    return "Tu sesión expiró. Inicia sesión nuevamente antes de importar.";
  }
  if (status === 403) return "No tienes permiso para importar usuarios.";
  if (status === 413) return "El archivo supera el tamaño permitido.";
  if (status === 400) {
    return "El archivo no se pudo leer. Revisa que sea un Excel con las columnas indicadas.";
  }
  return "No se pudo completar la importación. Inténtalo de nuevo.";
}

/**
 * Uploads the roster straight to the API. It does not travel through a Server
 * Action because those cap the body far below a real spreadsheet.
 */
export function UsersImportForm({ apiBaseUrl }: UsersImportFormProps) {
  const pendingRef = useRef(false);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const { showToast } = useToast();
  const [report, setReport] = useState<ImportReport | null>(null);

  async function handleSubmit(formData: FormData, form: HTMLFormElement) {
    if (pendingRef.current) return;

    setMessage(null);
    setServerErrors({});
    setReport(null);
    pendingRef.current = true;
    setPending(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;

      if (error || !accessToken) {
        setMessage("Tu sesión expiró. Inicia sesión nuevamente para importar.");
        return;
      }

      const response = await fetch(
        new URL("admin/users/import", apiBaseUrl + "/"),
        {
          body: formData,
          cache: "no-store",
          credentials: "omit",
          headers: {
            Accept: "application/json",
            Authorization: "Bearer " + accessToken,
          },
          method: "POST",
        },
      );

      if (!response.ok) {
        if (response.status === 400 || response.status === 413) {
          setServerErrors({ file: importErrorMessage(response.status) });
        } else {
          setMessage(importErrorMessage(response.status));
        }
        return;
      }

      const result = (await response.json()) as ImportReport;
      setReport(result);
      if (result.imported > 0) {
        const hasPendingRows = result.errors.length > 0 || result.truncated;
        showToast(
          hasPendingRows
            ? `${result.imported === 1 ? "Se registró 1 usuario" : `Se registraron ${result.imported} usuarios`}. Revisa las filas pendientes.`
            : "Importación completada con éxito.",
        );
        if (!hasPendingRows) form.reset();
        router.refresh();
      }
    } catch {
      setMessage("No se pudo completar la importación. Inténtalo de nuevo.");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <details className={styles.create}>
      <summary className={styles.createSummary}>Importar Excel</summary>
      <ValidatedForm
        aria-busy={pending}
        className={styles.form}
        onValidSubmit={handleSubmit}
        rules={IMPORT_RULES}
        serverErrors={serverErrors}
      >
        <p className={styles.formHint}>
          La primera fila debe tener las columnas <strong>Nombre y
          apellidos</strong> y <strong>Correo</strong>. Puedes añadir{" "}
          <strong>Celular</strong>, <strong>Inicio</strong> y{" "}
          <strong>Fin</strong>. Se registran las filas válidas y se te informa
          fila por fila de las que no.
        </p>
        <label className={styles.fieldLabel} htmlFor="users-import-file">
          Archivo Excel
        </label>
        <p className={styles.formHint} id="users-import-file-hint">
          Formato .xlsx; máximo 2 MB.
        </p>
        <input
          aria-describedby="users-import-file-hint"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className={styles.input}
          id="users-import-file"
          name="file"
          type="file"
        />
        <FieldError name="file" />
        <button
          aria-disabled={pending}
          className={styles.searchButton}
          type="submit"
        >
          {pending ? "Importando…" : "Importar usuarios"}
        </button>

        {pending ? (
          <p className={styles.formHint} role="status">
            Importando usuarios. Espera mientras se revisan las filas del archivo.
          </p>
        ) : null}

        {message ? (
          <p className="avend-feedback avend-feedback--error" role="alert">
            {message}
          </p>
        ) : null}

        {report ? (
          <div aria-live="polite" className={styles.importReport}>
            {report.imported === 0 ? (
              <p className="avend-feedback avend-feedback--error">
                No se registró ningún usuario. Revisa las filas indicadas y corrige el archivo antes de volver a importarlo.
              </p>
            ) : null}
            <p className={styles.importSummary}>
              Se registraron <strong>{report.imported}</strong> de{" "}
              <strong>{report.considered}</strong> filas.
            </p>
            {report.truncated ? (
              <p className={styles.importError}>
                El archivo tenía más filas de las permitidas en una importación:
                divide la lista y vuelve a subir el resto.
              </p>
            ) : null}
            {report.errors.length > 0 ? (
              <>
                <p className={styles.importSummary}>
                  Filas no registradas ({report.errors.length}):
                </p>
                <ul className={styles.importErrors}>
                  {report.errors.map((rowError) => (
                    <li key={`${rowError.rowNumber}-${rowError.email ?? ""}`}>
                      Fila {rowError.rowNumber}
                      {rowError.email ? ` (${rowError.email})` : ""}:{" "}
                      {rowError.message}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </ValidatedForm>
    </details>
  );
}
