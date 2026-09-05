import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDownloadUrl: vi.fn(),
  resolveAuthorizedAdminApiSession: vi.fn(),
}));

vi.mock("@/lib/admin-api/authorized-client", () => ({
  resolveAuthorizedAdminApiSession: mocks.resolveAuthorizedAdminApiSession,
}));

vi.mock("@/lib/admin-api/client", () => {
  class AdminApiError extends Error {
    constructor(readonly status: number) {
      super("Administrative API request failed.");
    }
  }

  class AdminApiResponseError extends Error {}

  return { AdminApiError, AdminApiResponseError };
});

import { AdminApiError, AdminApiResponseError } from "@/lib/admin-api/client";
import { GET } from "./route";

const documentId = "680a1b3e-9a76-46b9-9130-7284e03aa123";
const versionId = "f84e1198-6c7d-4fa2-998e-2dced81389d8";
const signedUrl =
  "https://storage.example.test/object/sign/document.pdf?token=short-lived";

function request(disposition = "inline") {
  return new Request(
    `https://avend.example/api/admin/documents/${documentId}/access?disposition=${disposition}&versionId=${versionId}`,
  );
}

function authorize() {
  mocks.resolveAuthorizedAdminApiSession.mockResolvedValue({
    access: {
      fullName: "Ana Administradora",
      modulesAccess: true,
      role: "superadmin",
      status: "authorized",
      userId: "user-1",
    },
    client: { getDownloadUrl: mocks.getDownloadUrl },
    status: "authorized",
  });
}

describe("admin document access BFF", () => {
  beforeEach(() => {
    mocks.getDownloadUrl.mockReset();
    mocks.resolveAuthorizedAdminApiSession.mockReset();
  });

  it("rejects unauthenticated requests without contacting the API", async () => {
    mocks.resolveAuthorizedAdminApiSession.mockResolvedValue({
      status: "unauthenticated",
    });

    const response = await GET(request(), {
      params: Promise.resolve({ id: documentId }),
    });

    expect(response.status).toBe(401);
    expect(mocks.getDownloadUrl).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: "DOCUMENT_ACCESS_DENIED" });
  });

  it("rejects administrators without module permission", async () => {
    mocks.resolveAuthorizedAdminApiSession.mockResolvedValue({
      access: {
        fullName: "Ana Administradora",
        modulesAccess: false,
        role: "admin",
        status: "authorized",
        userId: "user-1",
      },
      client: { getDownloadUrl: mocks.getDownloadUrl },
      status: "authorized",
    });

    const response = await GET(request(), {
      params: Promise.resolve({ id: documentId }),
    });

    expect(response.status).toBe(403);
    expect(mocks.getDownloadUrl).not.toHaveBeenCalled();
  });

  it("uses the authorized server client and redirects with hardened headers", async () => {
    authorize();
    mocks.getDownloadUrl.mockResolvedValue({
      expiresAt: "2026-09-01T15:01:00.000Z",
      url: signedUrl,
      versionId,
    });

    const response = await GET(request("inline"), {
      params: Promise.resolve({ id: documentId }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(signedUrl);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(mocks.getDownloadUrl).toHaveBeenCalledWith(
      documentId,
      versionId,
      "inline",
    );
  });

  it("fails closed for invalid input and a mismatched version", async () => {
    authorize();

    const invalidId = await GET(request(), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(invalidId.status).toBe(404);

    const invalidDisposition = await GET(request("preview"), {
      params: Promise.resolve({ id: documentId }),
    });
    expect(invalidDisposition.status).toBe(400);

    mocks.getDownloadUrl.mockResolvedValue({
      expiresAt: "2026-09-01T15:01:00.000Z",
      url: signedUrl,
      versionId: "d4c78ed6-e77d-414f-90f5-85df71f2ad84",
    });
    const mismatch = await GET(request(), {
      params: Promise.resolve({ id: documentId }),
    });
    expect(mismatch.status).toBe(502);
    expect(mismatch.headers.get("location")).toBeNull();
  });

  it.each([
    [new AdminApiError(404), 404],
    [new AdminApiError(500), 502],
    [new AdminApiResponseError(), 502],
    [new Error("private upstream detail"), 503],
  ])("maps upstream failures to safe status codes", async (error, status) => {
    authorize();
    mocks.getDownloadUrl.mockRejectedValue(error);

    const response = await GET(request(), {
      params: Promise.resolve({ id: documentId }),
    });

    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("private upstream detail");
  });
});
