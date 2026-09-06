import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAuthorizedContext: vi.fn(),
  getAttachmentDownloadUrl: vi.fn(),
}));

vi.mock("@/lib/consultation-reports-api/authorized-client", () => ({
  createAuthorizedConsultationReportsApiContext: mocks.createAuthorizedContext,
}));

import { ConsultationReportsApiError } from "@/lib/consultation-reports-api/client";
import { GET } from "./route";

const caseId = "39000000-0000-4000-8000-000000000001";
const attachmentId = "39000000-0000-4000-8000-000000000002";
const signedUrl = "https://storage.example.test/object/sign/archivo.pdf?token=short";

function request(mode = "download"): Request {
  return new Request(
    `https://avend.example/api/admin/consultation-cases/${caseId}/attachments/${attachmentId}/download?mode=${mode}`,
  );
}

const params = Promise.resolve({ attachmentId, caseId });

describe("consultation attachment access BFF", () => {
  beforeEach(() => {
    mocks.createAuthorizedContext.mockReset();
    mocks.getAttachmentDownloadUrl.mockReset();
    mocks.createAuthorizedContext.mockResolvedValue({
      client: { getAttachmentDownloadUrl: mocks.getAttachmentDownloadUrl },
    });
  });

  it("creates a short-lived inline URL to open an attachment", async () => {
    mocks.getAttachmentDownloadUrl.mockResolvedValue({
      expiresAt: "2026-09-06T12:00:00.000Z",
      url: signedUrl,
    });

    const response = await GET(request("view"), { params });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(signedUrl);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(mocks.getAttachmentDownloadUrl).toHaveBeenCalledWith(
      caseId,
      attachmentId,
      "view",
    );
  });

  it("uses a forced-download URL by default and rejects an invalid access mode", async () => {
    mocks.getAttachmentDownloadUrl.mockResolvedValue({
      expiresAt: "2026-09-06T12:00:00.000Z",
      url: signedUrl,
    });

    await GET(request(), { params });
    expect(mocks.getAttachmentDownloadUrl).toHaveBeenLastCalledWith(
      caseId,
      attachmentId,
      "download",
    );

    const invalid = await GET(request("replace"), { params });
    expect(invalid.status).toBe(400);
    expect(mocks.getAttachmentDownloadUrl).toHaveBeenCalledTimes(1);
  });

  it("does not disclose storage errors or URLs", async () => {
    mocks.getAttachmentDownloadUrl.mockRejectedValue(
      new ConsultationReportsApiError(403),
    );

    const response = await GET(request(), { params });

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).not.toContain("storage");
  });
});
