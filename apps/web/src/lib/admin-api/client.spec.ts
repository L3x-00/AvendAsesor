import { describe, expect, it, vi } from "vitest";
import { AdminApiClient, AdminApiError } from "./client";

const moduleRecord = {
  code: "NORMATIVA",
  createdAt: "2026-08-09T00:00:00.000Z",
  createdBy: null,
  deactivatedAt: null,
  deactivatedBy: null,
  deactivationReason: null,
  deletedAt: null,
  deletedBy: null,
  deletionReason: null,
  description: null,
  id: "2bd75b4c-6a27-460a-a16c-ebf0c3cdeac3",
  isActive: true,
  isDeleted: false,
  metadata: {},
  name: "Normativa",
  parentModuleId: null,
  sortOrder: 0,
  updatedAt: "2026-08-09T00:00:00.000Z",
  updatedBy: null,
};

const documentRecord = {
  articleReference: null,
  createdAt: "2026-08-09T00:00:00.000Z",
  createdBy: null,
  currentVersionId: "f84e1198-6c7d-4fa2-998e-2dced81389d8",
  deactivatedAt: null,
  deactivatedBy: null,
  deactivationReason: null,
  deletedAt: null,
  deletedBy: null,
  deletionReason: null,
  documentType: "NORMATIVE",
  id: "680a1b3e-9a76-46b9-9130-7284e03aa123",
  isDeleted: false,
  issuanceYear: 2026,
  issuingEntity: "AVEND",
  metadata: {},
  publicationStatus: "active" as const,
  replacementDate: null,
  replacementDocumentId: null,
  replacementObservation: null,
  replacementReason: null,
  replacementYear: null,
  resolutionNumber: null,
  situation: "current" as const,
  title: "Norma de prueba",
  updatedAt: "2026-08-09T00:00:00.000Z",
  updatedBy: null,
};

const documentDetails = {
  ...documentRecord,
  createdByName: null,
  moduleIds: [moduleRecord.id],
  versions: [
    {
      fileSizeBytes: 128,
      id: documentRecord.currentVersionId,
      ingestionStatus: "indexed" as const,
      ingestionUpdatedAt: "2026-08-10T00:00:00.000Z",
      originalFileName: "norma.pdf",
      pageCount: 1,
      uploadedAt: "2026-08-09T00:00:00.000Z",
      uploadedBy: null,
      uploadedByName: null,
      versionNumber: 1,
    },
  ],
};

const documentLibraryItem = {
  articleReference: documentRecord.articleReference,
  createdAt: documentRecord.createdAt,
  createdBy: documentRecord.createdBy,
  createdByName: null,
  currentVersionId: documentRecord.currentVersionId,
  currentVersionUploadedAt: documentRecord.createdAt,
  documentType: documentRecord.documentType,
  id: documentRecord.id,
  issuanceYear: documentRecord.issuanceYear,
  issuingEntity: documentRecord.issuingEntity,
  metadata: documentRecord.metadata,
  moduleAssociations: [
    {
      linkedModuleId: moduleRecord.id,
      linkedModuleName: moduleRecord.name,
      moduleId: moduleRecord.id,
      moduleName: moduleRecord.name,
      submoduleId: null,
      submoduleName: null,
    },
  ],
  publicationStatus: documentRecord.publicationStatus,
  replacementDate: null,
  replacementDocumentId: null,
  replacementObservation: null,
  replacementReason: null,
  replacementYear: null,
  resolutionNumber: null,
  situation: "current" as const,
  technicalStatus: "ready" as const,
  title: documentRecord.title,
  updatedAt: documentRecord.updatedAt,
  updatedBy: documentRecord.updatedBy,
};

const hito4Metrics = {
  activeDocuments: 2,
  activeModules: 3,
  dismissedUnansweredQuestions: 1,
  pendingIngestionJobs: 0,
  pendingUnansweredQuestions: 2,
  providerCostStatus: "not_configured" as const,
  resolvedUnansweredQuestions: 4,
  totalConversations: 6,
  totalUsers: 3,
};

const unansweredQuestion = {
  category: null,
  conversationId: null,
  createdAt: "2026-08-24T00:00:00.000Z",
  id: "2bd75b4c-6a27-460a-a16c-ebf0c3cdeac3",
  messageId: null,
  question: "¿Qué sustento corresponde?",
  reason: "insufficient_evidence" as const,
  reviewedAt: null,
  reviewedBy: null,
  reviewNote: null,
  selectedModuleId: null,
  status: "pending_review" as const,
  topRelevanceScore: null,
};

const administrativeUser = {
  accountStatus: "active" as const,
  fullName: "Cuenta de prueba",
  id: "680a1b3e-9a76-46b9-9130-7284e03aa123",
  lastAccessAt: null,
  role: "admin" as const,
};

const auditEvent = {
  action: "user_role_changed" as const,
  actorId: administrativeUser.id,
  actorRole: "superadmin" as const,
  id: "f84e1198-6c7d-4fa2-998e-2dced81389d8",
  metadata: {},
  occurredAt: "2026-08-24T00:00:00.000Z",
  resourceId: administrativeUser.id,
  resourceType: "profile" as const,
};

function successfulJson(payload: unknown): Response {
  return {
    json: vi.fn(async () => payload),
    ok: true,
    status: 200,
  } as unknown as Response;
}

describe("AdminApiClient", () => {
  it("uses the server-only bearer token and a bounded module request without retrying", async () => {
    const request = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => successfulJson([moduleRecord]));
    const client = new AdminApiClient(
      "server-session-token",
      "http://localhost:3001",
      request,
    );

    await expect(client.listModules()).resolves.toEqual([moduleRecord]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "http://localhost:3001/admin/modules?status=all",
      expect.objectContaining({
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer server-session-token",
        },
        method: "GET",
      }),
    );
  });

  it("keeps multipart boundaries intact for an upload and never adds JSON content type", async () => {
    const request = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => successfulJson(moduleRecord));
    const client = new AdminApiClient(
      "server-session-token",
      "http://localhost:3001",
      request,
    );
    const payload = new FormData();
    payload.set(
      "file",
      new File(["%PDF-1.7"], "norma.pdf", { type: "application/pdf" }),
    );

    await expect(client.createDocument(payload)).rejects.toThrow(
      "Administrative API returned an invalid response.",
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      body: payload,
      headers: {
        Accept: "application/json",
        Authorization: "Bearer server-session-token",
      },
      method: "POST",
    });
  });

  it("maps HTTP failures without consuming or relaying backend response text", async () => {
    const request = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => ({ ok: false, status: 503 }) as Response);
    const client = new AdminApiClient(
      "server-session-token",
      "http://localhost:3001",
      request,
    );

    await expect(client.listDocuments()).rejects.toEqual(
      new AdminApiError(503),
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("uses bounded server-side document library filters and explicit PDF disposition", async () => {
    const request = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async (input) =>
      String(input).includes("/library?")
        ? successfulJson({
            items: [documentLibraryItem],
            limit: 20,
            offset: 20,
            total: 42,
          })
        : successfulJson({
            expiresAt: "2026-08-09T00:01:00.000Z",
            url: "http://localhost:55321/storage/v1/object/sign/normative-documents/test",
            versionId: documentRecord.currentVersionId,
          }),
    );
    const client = new AdminApiClient(
      "server-session-token",
      "http://localhost:3001",
      request,
    );

    await expect(
      client.listDocumentLibrary({
        limit: 20,
        offset: 20,
        q: "licencia",
        situation: "current",
        sort: "title",
      }),
    ).resolves.toMatchObject({ total: 42 });
    await client.getDownloadUrl(
      documentRecord.id,
      documentRecord.currentVersionId,
      "inline",
    );

    expect(String(request.mock.calls[0]?.[0])).toContain(
      "/admin/documents/library?limit=20&offset=20&sort=title&q=licencia&situation=current",
    );
    expect(request.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({
        disposition: "inline",
        versionId: documentRecord.currentVersionId,
      }),
    );
  });

  it("maps each administrative resource operation to the protected backend contract", async () => {
    const request = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async (input) => {
      const url = String(input);

      if (url.endsWith("/download-url")) {
        return successfulJson({
          expiresAt: "2026-08-09T00:01:00.000Z",
          url: "http://localhost:55321/storage/v1/object/sign/normative-documents/test",
          versionId: documentRecord.currentVersionId,
        });
      }

      if (url.includes("/documents/") && !url.endsWith("/versions")) {
        return successfulJson(documentDetails);
      }

      if (url.includes("/documents")) {
        return successfulJson(documentRecord);
      }

      return successfulJson(moduleRecord);
    });
    const client = new AdminApiClient(
      "server-session-token",
      "http://localhost:3001",
      request,
    );
    const pdf = new FormData();
    pdf.set("file", new File(["%PDF-1.7"], "norma.pdf"));

    await client.addDocumentVersion(documentRecord.id, pdf);
    await client.createModule({
      code: moduleRecord.code,
      name: moduleRecord.name,
    });
    await client.deleteDocument(documentRecord.id, "Retirado");
    await client.deleteModule(moduleRecord.id, "Retirado");
    await expect(client.getDocument(documentRecord.id)).resolves.toEqual(
      documentDetails,
    );
    await expect(
      client.getDownloadUrl(documentRecord.id),
    ).resolves.toMatchObject({
      versionId: documentRecord.currentVersionId,
    });
    await client.linkDocumentModule(documentRecord.id, moduleRecord.id);
    await client.setDocumentStatus(documentRecord.id, false, "Revisión");
    await client.setModuleStatus(moduleRecord.id, false, "Revisión");
    await client.unlinkDocumentModule(documentRecord.id, moduleRecord.id);
    await client.updateDocument(documentRecord.id, { title: "Actualizado" });
    await client.updateModule(moduleRecord.id, { name: "Actualizado" });

    expect(request).toHaveBeenCalledTimes(12);
    expect(request.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        `http://localhost:3001/admin/documents/${documentRecord.id}/versions`,
        "http://localhost:3001/admin/modules",
        `http://localhost:3001/admin/documents/${documentRecord.id}`,
        `http://localhost:3001/admin/modules/${moduleRecord.id}`,
        `http://localhost:3001/admin/documents/${documentRecord.id}/download-url`,
      ]),
    );
  });

  it("fails closed when a successful response does not match the web contract", async () => {
    const request = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => successfulJson({ id: "not-a-uuid" }));
    const client = new AdminApiClient(
      "server-session-token",
      "http://localhost:3001",
      request,
    );

    await expect(client.listModules()).rejects.toThrow(
      "Administrative API returned an invalid response.",
    );
  });

  it("maps Hito 4 operational and superadministration contracts without exposing a browser client", async () => {
    const request = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async (input) => {
      const url = String(input);
      if (url.includes("/operations/metrics"))
        return successfulJson(hito4Metrics);
      if (url.includes("/operations/unanswered-questions?"))
        return successfulJson([unansweredQuestion]);
      if (url.includes("/audit-events")) return successfulJson([auditEvent]);
      if (url.includes("/admin/users/page?"))
        return successfulJson({
          items: [administrativeUser],
          limit: 25,
          offset: 25,
          total: 1,
        });
      if (url.includes("/admin/users/"))
        return successfulJson(administrativeUser);
      return successfulJson({});
    });
    const client = new AdminApiClient(
      "server-session-token",
      "http://localhost:3001",
      request,
    );

    await expect(client.getOperationalMetrics()).resolves.toEqual(hito4Metrics);
    await expect(client.listUnansweredQuestions()).resolves.toEqual([
      unansweredQuestion,
    ]);
    await client.reviewUnansweredQuestion(unansweredQuestion.id, {
      category: "documentation_gap",
      decision: "resolved",
      reviewNote: "Se requiere revisar el documento fuente.",
    });
    await expect(
      client.listAdministrativeUsers({
        group: "staff",
        limit: 25,
        offset: 25,
        search: "prueba",
        status: "active",
      }),
    ).resolves.toEqual({
      items: [administrativeUser],
      limit: 25,
      offset: 25,
      total: 1,
    });
    await expect(client.listOperationalAuditEvents()).resolves.toEqual([
      auditEvent,
    ]);
    await expect(
      client.updateAdministrativeUser(administrativeUser.id, {
        accountStatus: "suspended",
        reason: "Prueba de acceso.",
      }),
    ).resolves.toEqual(administrativeUser);

    expect(request.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        "http://localhost:3001/admin/operations/metrics",
        "http://localhost:3001/admin/operations/unanswered-questions?limit=100&status=pending_review",
        `http://localhost:3001/admin/operations/unanswered-questions/${unansweredQuestion.id}/review`,
        "http://localhost:3001/admin/users/page?limit=25&offset=25&group=staff&search=prueba&status=active",
        "http://localhost:3001/admin/users/audit-events?limit=100",
        `http://localhost:3001/admin/users/${administrativeUser.id}`,
      ]),
    );
  });
});
