"use client";

import { type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import styles from "./users-manager.module.css";

/** Matches the ceiling the API enforces for one roster. */
export const MAX_USER_IMPORT_BYTES = 2 * 1024 * 1024;

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
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    // Se lee del propio input: FormData reconstruye la entrada y no es la
    // fuente fiable para inspeccionar el archivo antes de enviarlo.
    const input = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = input?.files?.[0];

    if (!file) {
      setReport(null);
      setMessage("Elige el archivo Excel con los usuarios.");
      return;
    }

    if (file.size > MAX_USER_IMPORT_BYTES) {
      setReport(null);
      setMessage("El archivo supera el tamaño permitido para una importación.");
      return;
    }

    setMessage(null);
    setReport(null);
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
        setMessage(importErrorMessage(response.status));
        return;
      }

      const result = (await response.json()) as ImportReport;
      setReport(result);
      formRef.current?.reset();
      if (result.imported > 0) router.refresh();
    } catch {
      setMessage("No se pudo completar la importación. Inténtalo de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <details className={styles.create}>
      <summary className={styles.createSummary}>Importar Excel</summary>
      {/* noValidate: la validación nativa bloqueaba el envío sin decir por qué. */}
      <form
        className={styles.form}
        noValidate
        onSubmit={handleSubmit}
        ref={formRef}
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
        <input
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className={styles.input}
          id="users-import-file"
          name="file"
          type="file"
        />
        <button
          className={styles.searchButton}
          disabled={pending}
          type="submit"
        >
          {pending ? "Importando…" : "Importar usuarios"}
        </button>

        {message ? (
          <p aria-live="polite" className={styles.importError} role="status">
            {message}
          </p>
        ) : null}

        {report ? (
          <div aria-live="polite" className={styles.importReport}>
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
      </form>
    </details>
  );
}
