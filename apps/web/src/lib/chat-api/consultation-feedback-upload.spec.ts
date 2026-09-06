import { File as NodeFile } from "node:buffer";
import { Request as UndiciRequest } from "undici";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConsultationFeedbackUploadError,
  MAX_CONSULTATION_ATTACHMENT_BYTES,
  MAX_CONSULTATION_MULTIPART_BYTES,
  optionalConsultationFeedbackFile,
  readConsultationFeedbackFormData,
} from "./consultation-feedback-upload";

const boundary = "----avend-feedback-test-boundary";

function multipartBody(): string {
  return [
    `--${boundary}`,
    'Content-Disposition: form-data; name="comment"',
    "",
    "Revisar esta fuente",
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="captura.png"',
    "Content-Type: image/png",
    "",
    "imagen",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function multipartRequest(
  body = multipartBody(),
  headers?: HeadersInit,
): Request {
  return new UndiciRequest("https://avend.example/feedback", {
    body,
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      ...headers,
    },
    method: "POST",
  }) as unknown as Request;
}

describe("consultation feedback upload boundaries", () => {
  beforeEach(() => vi.stubGlobal("File", NodeFile));
  afterEach(() => vi.unstubAllGlobals());

  it("parses a bounded multipart form and keeps an allowed file", async () => {
    const parsed = await readConsultationFeedbackFormData(multipartRequest());
    const file = optionalConsultationFeedbackFile(parsed.get("file"), [
      "image/png",
    ]);

    expect(parsed.get("comment")).toBe("Revisar esta fuente");
    expect(file?.name).toBe("captura.png");
    expect(file?.type).toBe("image/png");
  });

  it("rejects non-multipart and oversized declared requests before parsing", async () => {
    await expect(
      readConsultationFeedbackFormData(
        new UndiciRequest("https://avend.example/feedback", {
          body: JSON.stringify({ comment: "No es multipart" }),
          method: "POST",
        }) as unknown as Request,
      ),
    ).rejects.toMatchObject({ kind: "invalid" });

    await expect(
      readConsultationFeedbackFormData(
        multipartRequest("x", {
          "content-length": String(MAX_CONSULTATION_MULTIPART_BYTES + 1),
        }),
      ),
    ).rejects.toMatchObject({ kind: "too_large" });
  });

  it("rejects an oversized streaming body without trusting Content-Length", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new Uint8Array(MAX_CONSULTATION_MULTIPART_BYTES + 1),
        );
        controller.close();
      },
    });
    const request = new UndiciRequest("https://avend.example/feedback", {
      body,
      // `duplex` is required by the Node implementation used by Next.js.
      duplex: "half",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      method: "POST",
    } as unknown as ConstructorParameters<
      typeof UndiciRequest
    >[1]) as unknown as Request;

    await expect(
      readConsultationFeedbackFormData(request),
    ).rejects.toMatchObject({
      kind: "too_large",
    });
  });

  it("rejects unsupported or oversized files and treats an empty picker as absent", () => {
    expect(() =>
      optionalConsultationFeedbackFile(
        new File(["x"], "archivo.txt", { type: "text/plain" }),
        ["image/png"],
      ),
    ).toThrow(ConsultationFeedbackUploadError);
    expect(() =>
      optionalConsultationFeedbackFile(
        new File(
          [new Uint8Array(MAX_CONSULTATION_ATTACHMENT_BYTES + 1)],
          "grande.png",
          { type: "image/png" },
        ),
        ["image/png"],
      ),
    ).toThrow(ConsultationFeedbackUploadError);
    expect(
      optionalConsultationFeedbackFile(new File([], ""), ["image/png"]),
    ).toBeNull();
  });
});
