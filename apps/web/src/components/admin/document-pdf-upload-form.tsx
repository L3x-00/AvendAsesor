'use client';

import {
  type FormEvent,
  type ReactNode,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export const MAX_ADMIN_PDF_BYTES = 20 * 1024 * 1024;

interface DocumentPdfUploadFormProps {
  apiBaseUrl: string;
  children: ReactNode;
  className?: string;
  endpoint: string;
  submitLabel: string;
  successMessage: string;
}

type UploadFeedback = {
  message?: string;
  status: 'error' | 'idle' | 'success';
};

function getUploadErrorMessage(status: number): string {
  if (status === 400 || status === 422) {
    return 'El PDF o los datos ingresados no son válidos. Revísalos; el formulario conserva toda la información.';
  }

  if (status === 401) {
    return 'Tu sesión expiró. Inicia sesión nuevamente antes de cargar el PDF.';
  }

  if (status === 403) {
    return 'No tienes permiso para cargar documentos.';
  }

  if (status === 409) {
    return 'La carga entra en conflicto con el estado actual. Los datos se conservaron para que puedas revisarlos.';
  }

  if (status === 413) {
    return 'El PDF supera el límite permitido de 20 MiB.';
  }

  if (status === 429) {
    return 'Se alcanzó el límite temporal de cargas. Espera un minuto; tus datos permanecen en el formulario.';
  }

  if (status === 503) {
    return 'No se pudo confirmar la carga. Revisa el listado antes de volver a enviarla; tus datos permanecen en el formulario.';
  }

  return 'No fue posible cargar el PDF. Comprueba tu conexión e inténtalo nuevamente; tus datos se conservaron.';
}

function isFileEntry(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    'size' in value &&
    typeof value.size === 'number' &&
    'type' in value &&
    typeof value.type === 'string'
  );
}

function validatePdf(formData: FormData): string | undefined {
  const file = formData.get('file');

  if (!isFileEntry(file) || file.size === 0) {
    return 'Selecciona un archivo PDF no vacío.';
  }

  if (!file.name.toLocaleLowerCase('es').endsWith('.pdf')) {
    return 'El archivo seleccionado debe tener extensión .pdf.';
  }

  if (file.size > MAX_ADMIN_PDF_BYTES) {
    return 'El PDF no puede superar los 20 MiB.';
  }

  return undefined;
}

export function DocumentPdfUploadForm({
  apiBaseUrl,
  children,
  className = 'space-y-3',
  endpoint,
  submitLabel,
  successMessage,
}: DocumentPdfUploadFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [feedback, setFeedback] = useState<UploadFeedback>({ status: 'idle' });
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending) return;

    const form = event.currentTarget;

    // Native validation is disabled on the form (noValidate) so this custom
    // handler always runs — otherwise the browser silently blocks the submit
    // and scrolls to the first invalid field, and the button appears to do
    // nothing. Surface any constraint error explicitly instead.
    if (!form.reportValidity()) {
      setFeedback({
        message:
          'Revisa los campos marcados: falta el PDF o algún dato no cumple el formato solicitado.',
        status: 'error',
      });
      return;
    }

    const formData = new window.FormData(form);
    const fileInput = form.elements.namedItem('file');
    const selectedFile =
      fileInput instanceof window.HTMLInputElement
        ? fileInput.files?.item(0)
        : null;

    if (selectedFile) {
      formData.set('file', selectedFile, selectedFile.name);
    }

    if (form.elements.namedItem('moduleId')) {
      const moduleIds = formData
        .getAll('moduleId')
        .filter((value): value is string => typeof value === 'string');
      formData.delete('moduleId');
      formData.set('moduleIds', JSON.stringify(moduleIds));
    }

    // Drop blank optional fields. The API's `@IsOptional()` only skips
    // null/undefined, so an empty string (e.g. an untouched metadata,
    // issuingEntity or issuanceYear input) fails validation with 400. The
    // removed Server Action rebuilt a clean payload that omitted these; the
    // direct upload must do the same or every normal upload breaks.
    for (const key of new Set(formData.keys())) {
      const values = formData.getAll(key);
      if (
        values.every(
          (value) => typeof value === 'string' && value.trim() === '',
        )
      ) {
        formData.delete(key);
      }
    }

    const validationMessage = validatePdf(formData);

    if (validationMessage) {
      setFeedback({ message: validationMessage, status: 'error' });
      return;
    }

    setFeedback({ status: 'idle' });
    setPending(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;

      if (error || !accessToken) {
        setFeedback({
          message: 'Tu sesión expiró. Inicia sesión nuevamente antes de cargar el PDF.',
          status: 'error',
        });
        return;
      }

      const response = await fetch(new URL(endpoint, apiBaseUrl + '/'), {
        body: formData,
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer ' + accessToken,
        },
        method: 'POST',
      });

      if (!response.ok) {
        setFeedback({
          message: getUploadErrorMessage(response.status),
          status: 'error',
        });
        return;
      }

      formRef.current?.reset();
      setFeedback({ message: successMessage, status: 'success' });
      router.refresh();
    } catch {
      setFeedback({
        message:
          'No fue posible conectar con el servicio de documentos. Tus datos se conservaron para volver a intentarlo.',
        status: 'error',
      });
    } finally {
      setPending(false);
    }
  }

  const feedbackClassName =
    feedback.status === 'success'
      ? 'avend-feedback--success'
      : 'avend-feedback--error';

  return (
    <form
      aria-busy={pending}
      className={className}
      noValidate
      onSubmit={(event) => void submit(event)}
      ref={formRef}
    >
      {children}
      {feedback.message ? (
        <p
          aria-live="polite"
          className={['avend-feedback', feedbackClassName].join(' ')}
          role={feedback.status === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </p>
      ) : null}
      <button
        className="avend-button avend-button--primary avend-admin-submit"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Cargando PDF…' : submitLabel}
      </button>
    </form>
  );
}
