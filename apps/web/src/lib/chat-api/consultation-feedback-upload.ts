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

/**
 * Bounds a multipart body while the runtime parses it, including requests without a
 * Content-Length header. This protects the BFF itself; the API additionally
 * validates the binary signature before it reaches private storage.
 */
export async function readConsultationFeedbackFormData(
  request: Request,
): Promise<FormData> {
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data;")) {
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

  try {
    let byteLength = 0;
    // One reader enforces the cap as the multipart parser consumes the body.
    // An oversized chunk aborts the upstream stream without waiting for EOF.
    const body = request.body?.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          byteLength += chunk.byteLength;
          if (byteLength > MAX_CONSULTATION_MULTIPART_BYTES) {
            throw new ConsultationFeedbackUploadError("too_large");
          }
          controller.enqueue(chunk);
        },
      }),
    );
    return await new Response(body, {
      headers: { "content-type": contentType },
    }).formData();
  } catch (error) {
    if (error instanceof ConsultationFeedbackUploadError) throw error;
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
