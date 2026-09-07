export const MAX_CONSULTATION_ATTACHMENT_BYTES = 10 * 1024 * 1024;
// Multipart boundaries and the small text fields are allowed in addition to
// the 10 MiB file limit enforced by the API and storage bucket.
export const MAX_CONSULTATION_MULTIPART_BYTES =
  MAX_CONSULTATION_ATTACHMENT_BYTES + 128 * 1024;

export class ConsultationFeedbackUploadError extends Error {
  constructor(readonly kind: "invalid" | "too_large") {
    super("The consultation feedback upload is invalid.");
  }
}

async function consumeBoundedBody(request: Request): Promise<boolean> {
  if (!request.body) return true;

  const reader = request.body.getReader();
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      byteLength += value.byteLength;
      if (byteLength > MAX_CONSULTATION_MULTIPART_BYTES) {
        await reader.cancel();
        return false;
      }
    }
  } finally {
    reader.releaseLock();
  }

  return true;
}

/**
 * Bounds a multipart body before Next parses it, including requests without a
 * Content-Length header. This protects the BFF itself; the API additionally
 * validates the binary signature before it reaches private storage.
 */
export async function readConsultationFeedbackFormData(
  request: Request,
): Promise<FormData> {
  const contentType = request.headers.get("content-type")?.toLowerCase();
  if (!contentType?.startsWith("multipart/form-data;")) {
    throw new ConsultationFeedbackUploadError("invalid");
  }
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength &&
    (!/^\d+$/u.test(declaredLength) ||
      !Number.isSafeInteger(Number(declaredLength)) ||
      Number(declaredLength) > MAX_CONSULTATION_MULTIPART_BYTES)
  ) {
    throw new ConsultationFeedbackUploadError("too_large");
  }

  // Clone before consuming so Next/undici can parse the exact multipart
  // payload after this branch has enforced the byte limit. Cancelling the
  // clone below releases the tee when a chunk crosses that limit.
  const parsableRequest = request.clone();
  const isBounded = await consumeBoundedBody(request);
  if (!isBounded) {
    await parsableRequest.body?.cancel().catch(() => undefined);
    throw new ConsultationFeedbackUploadError("too_large");
  }

  try {
    return await parsableRequest.formData();
  } catch {
    throw new ConsultationFeedbackUploadError("invalid");
  }
}

export function optionalConsultationFeedbackFile(
  value: FormDataEntryValue | null,
  allowedMimeTypes: readonly string[],
): File | null {
  if (value === null) return null;
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as File).arrayBuffer !== "function" ||
    typeof (value as File).name !== "string" ||
    typeof (value as File).size !== "number" ||
    typeof (value as File).type !== "string"
  ) {
    throw new ConsultationFeedbackUploadError("invalid");
  }
  const file = value as File;
  // Browsers represent an untouched <input type=file> as an empty File.
  if (file.size === 0 && !file.name) return null;
  if (
    file.size < 1 ||
    file.size > MAX_CONSULTATION_ATTACHMENT_BYTES ||
    !allowedMimeTypes.includes(file.type)
  ) {
    throw new ConsultationFeedbackUploadError(
      file.size > MAX_CONSULTATION_ATTACHMENT_BYTES ? "too_large" : "invalid",
    );
  }
  return file;
}
