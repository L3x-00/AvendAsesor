import "server-only";
import { ZodError, type ZodType } from "zod";
import { getAdminApiUrl } from "./config";
import {
  downloadUrlSchema,
  adminModulePermissionSchema,
  documentSuggestionsSchema,
  documentUploaderListSchema,
  documentLibraryPageSchema,
  adminHomeDashboardSchema,
  administrativeUserSchema,
  administrativeUserBaseSchema,
  administrativeUserCountsSchema,
  managedDocumentDetailsSchema,
  managedDocumentSchema,
  managedModuleSchema,
  managedModuleSummarySchema,
  operationalAuditEventSchema,
  operationalMetricsSchema,
  unansweredQuestionSchema,
  type AdministrativeUser,
  type AdministrativeUserBase,
  type AdministrativeUserCounts,
  type CreateAdministrativeUserInput,
  type AdminHomeDashboard,
  type AdministrativeUserPage,
  type AdministrativeUserQuery,
  type AdminModulePermission,
  administrativeUserPageSchema,
  type DownloadUrl,
  type DocumentSuggestions,
  type DocumentUploader,
  type DocumentLibraryPage,
  type DocumentLibraryQuery,
  type DocumentSituation,
  type ManagedDocument,
  type ManagedDocumentDetails,
  type ManagedModule,
  type ManagedModuleSummary,
  type OperationalAuditEvent,
  type OperationalMetrics,
  type UnansweredQuestion,
} from "./types";

export class AdminApiError extends Error {
  constructor(readonly status: number) {
    super("Administrative API request failed.");
  }
}

export class AdminApiResponseError extends Error {
  constructor() {
    super("Administrative API returned an invalid response.");
  }
}

type RequestBody = BodyInit | undefined;

export class AdminApiClient {
  constructor(
    private readonly accessToken: string,
    private readonly baseUrl = getAdminApiUrl(),
    private readonly request: typeof fetch = fetch,
  ) {}

  async addDocumentVersion(
    documentId: string,
    payload: FormData,
  ): Promise<ManagedDocument> {
    return this.send(
      `/admin/documents/${documentId}/versions`,
      { body: payload, method: "POST" },
      managedDocumentSchema,
    );
  }

  async createDocument(payload: FormData): Promise<ManagedDocument> {
    return this.send(
      "/admin/documents",
      { body: payload, method: "POST" },
      managedDocumentSchema,
    );
  }

  async createModule(payload: Record<string, unknown>): Promise<ManagedModule> {
    return this.send(
      "/admin/modules",
      { body: JSON.stringify(payload), method: "POST" },
      managedModuleSchema,
    );
  }

  async deleteDocument(documentId: string, reason: string): Promise<void> {
    await this.send(`/admin/documents/${documentId}`, {
      body: JSON.stringify({ reason }),
      method: "DELETE",
    });
  }

  async deleteModule(moduleId: string, reason: string): Promise<void> {
    await this.send(`/admin/modules/${moduleId}`, {
      body: JSON.stringify({ reason }),
      method: "DELETE",
    });
  }

  async getDocument(documentId: string): Promise<ManagedDocumentDetails> {
    return this.send(
      `/admin/documents/${documentId}`,
      { method: "GET" },
      managedDocumentDetailsSchema,
    );
  }

  async getDocumentSuggestions(): Promise<DocumentSuggestions> {
    return this.send(
      "/admin/documents/suggestions",
      { method: "GET" },
      documentSuggestionsSchema,
    );
  }

  async listDocumentUploaders(): Promise<DocumentUploader[]> {
    return this.send(
      "/admin/documents/uploaders",
      { method: "GET" },
      documentUploaderListSchema,
    );
  }

  async getDownloadUrl(
    documentId: string,
    versionId?: string,
    disposition: "attachment" | "inline" = "attachment",
  ): Promise<DownloadUrl> {
    return this.send(
      `/admin/documents/${documentId}/download-url`,
      {
        body: JSON.stringify({
          disposition,
          ...(versionId ? { versionId } : {}),
        }),
        method: "POST",
      },
      downloadUrlSchema,
    );
  }

  async getHomeDashboard(): Promise<AdminHomeDashboard> {
    return this.send(
      "/admin/dashboard",
      { method: "GET" },
      adminHomeDashboardSchema,
    );
  }

  async getOperationalMetrics(): Promise<OperationalMetrics> {
    return this.send(
      "/admin/operations/metrics",
      { method: "GET" },
      operationalMetricsSchema,
    );
  }

  async linkDocumentModule(
    documentId: string,
    moduleId: string,
  ): Promise<void> {
    await this.send(`/admin/documents/${documentId}/modules`, {
      body: JSON.stringify({ moduleId }),
      method: "POST",
    });
  }

  async listDocuments(status: "active" | "all" | "inactive" = "all") {
    const query = new URLSearchParams({ limit: "100", offset: "0", status });

    return this.send(
      `/admin/documents?${query.toString()}`,
      { method: "GET" },
      managedDocumentSchema.array(),
    );
  }

  async listDocumentLibrary(
    filters: DocumentLibraryQuery = {},
  ): Promise<DocumentLibraryPage> {
    const query = new URLSearchParams({
      limit: String(filters.limit ?? 25),
      offset: String(filters.offset ?? 0),
      sort: filters.sort ?? "newest",
    });

    if (filters.q) query.set("q", filters.q);
    if (filters.issuanceYear !== undefined) {
      query.set("issuanceYear", String(filters.issuanceYear));
    }
    if (filters.documentType) query.set("documentType", filters.documentType);
    if (filters.issuingEntity)
      query.set("issuingEntity", filters.issuingEntity);
    if (filters.moduleId) query.set("moduleId", filters.moduleId);
    if (filters.submoduleId) query.set("submoduleId", filters.submoduleId);
    if (filters.situation) query.set("situation", filters.situation);
    if (filters.technicalStatus) {
      query.set("technicalStatus", filters.technicalStatus);
    }
    if (filters.createdBy) query.set("createdBy", filters.createdBy);
    if (filters.createdFrom) query.set("createdFrom", filters.createdFrom);
    if (filters.createdTo) query.set("createdTo", filters.createdTo);

    return this.send(
      `/admin/documents/library?${query.toString()}`,
      { method: "GET" },
      documentLibraryPageSchema,
    );
  }

  async listAdministrativeUsers(
    filters: AdministrativeUserQuery = {},
  ): Promise<AdministrativeUserPage> {
    const query = new URLSearchParams({
      limit: String(filters.limit ?? 25),
      offset: String(filters.offset ?? 0),
    });

    if (filters.accessState) query.set("accessState", filters.accessState);
    if (filters.group) query.set("group", filters.group);
    if (filters.search?.trim()) query.set("search", filters.search.trim());
    if (filters.status) query.set("status", filters.status);

    return this.send(
      `/admin/users/page?${query.toString()}`,
      { method: "GET" },
      administrativeUserPageSchema,
    );
  }

  async createAdministrativeUser(
    payload: CreateAdministrativeUserInput,
  ): Promise<AdministrativeUser> {
    return this.send(
      '/admin/users',
      { body: JSON.stringify(payload), method: 'POST' },
      administrativeUserSchema,
    );
  }

  /**
   * Binary download: the directory export is a spreadsheet, so it never goes
   * through the JSON parsing path.
   */
  async exportAdministrativeUsers(
    filters: Pick<
      AdministrativeUserQuery,
      "accessState" | "group" | "search"
    > = {},
  ): Promise<ArrayBuffer> {
    const query = new URLSearchParams();
    if (filters.accessState) query.set("accessState", filters.accessState);
    if (filters.group) query.set("group", filters.group);
    if (filters.search?.trim()) query.set("search", filters.search.trim());

    const serialized = query.toString();
    const response = await this.request(
      `${this.baseUrl}/admin/users/export${serialized ? `?${serialized}` : ""}`,
      {
        cache: "no-store",
        headers: {
          Accept:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          Authorization: `Bearer ${this.accessToken}`,
        },
        method: "GET",
      },
    );

    if (!response.ok) throw new AdminApiError(response.status);

    return response.arrayBuffer();
  }

  async countAdministrativeUsers(
    filters: Pick<AdministrativeUserQuery, "group" | "search"> = {},
  ): Promise<AdministrativeUserCounts> {
    const query = new URLSearchParams();

    if (filters.group) query.set("group", filters.group);
    if (filters.search?.trim()) query.set("search", filters.search.trim());

    const serialized = query.toString();
    return this.send(
      serialized ? `/admin/users/counts?${serialized}` : "/admin/users/counts",
      { method: "GET" },
      administrativeUserCountsSchema,
    );
  }

  async listOperationalAuditEvents(): Promise<OperationalAuditEvent[]> {
    const query = new URLSearchParams({ limit: "100" });

    return this.send(
      `/admin/users/audit-events?${query.toString()}`,
      { method: "GET" },
      operationalAuditEventSchema.array(),
    );
  }

  async listModules(status: "active" | "all" | "inactive" = "all") {
    const query = new URLSearchParams({ status });

    return this.send(
      `/admin/modules?${query.toString()}`,
      { method: "GET" },
      managedModuleSchema.array(),
    );
  }

  async listModuleSummaries(
    status: "active" | "all" | "inactive" = "all",
  ): Promise<ManagedModuleSummary[]> {
    const query = new URLSearchParams({ status });

    return this.send(
      `/admin/modules/summary?${query.toString()}`,
      { method: "GET" },
      managedModuleSummarySchema.array(),
    );
  }

  async listUnansweredQuestions(
    status: "dismissed" | "pending_review" | "resolved" = "pending_review",
  ): Promise<UnansweredQuestion[]> {
    const query = new URLSearchParams({ limit: "100", status });

    return this.send(
      `/admin/operations/unanswered-questions?${query.toString()}`,
      { method: "GET" },
      unansweredQuestionSchema.array(),
    );
  }

  async setDocumentStatus(
    documentId: string,
    isActive: boolean,
    reason?: string,
  ): Promise<ManagedDocument> {
    return this.send(
      `/admin/documents/${documentId}/status`,
      { body: JSON.stringify({ isActive, reason }), method: "PATCH" },
      managedDocumentSchema,
    );
  }

  async setDocumentTechnicalStatus(
    documentId: string,
    technicalStatus: "pending_approval" | "ready",
  ): Promise<ManagedDocument> {
    return this.send(
      `/admin/documents/${documentId}/technical-status`,
      {
        body: JSON.stringify({ technicalStatus }),
        method: "PATCH",
      },
      managedDocumentSchema,
    );
  }

  async setDocumentSituation(
    documentId: string,
    payload: {
      archiveReasonCode?: string;
      archiveReasonDetail?: string;
      observation?: string;
      reason?: string;
      replacementDate?: string;
      replacementDocumentId?: string;
      replacementYear?: number;
      situation: DocumentSituation;
    },
  ): Promise<ManagedDocument> {
    return this.send(
      `/admin/documents/${documentId}/situation`,
      { body: JSON.stringify(payload), method: "PATCH" },
      managedDocumentSchema,
    );
  }

  async setModuleStatus(
    moduleId: string,
    isActive: boolean,
    reason?: string,
  ): Promise<ManagedModule> {
    return this.send(
      `/admin/modules/${moduleId}/status`,
      { body: JSON.stringify({ isActive, reason }), method: "PATCH" },
      managedModuleSchema,
    );
  }

  async reviewUnansweredQuestion(
    questionId: string,
    payload: {
      category:
        | "documentation_gap"
        | "duplicate"
        | "module_configuration"
        | "other"
        | "outside_scope";
      decision: "dismissed" | "resolved";
      reviewNote: string;
    },
  ): Promise<void> {
    await this.send(
      `/admin/operations/unanswered-questions/${questionId}/review`,
      {
        body: JSON.stringify(payload),
        method: "PATCH",
      },
    );
  }

  async unlinkDocumentModule(
    documentId: string,
    moduleId: string,
  ): Promise<void> {
    await this.send(`/admin/documents/${documentId}/modules/${moduleId}`, {
      method: "DELETE",
    });
  }

  async updateDocument(
    documentId: string,
    payload: Record<string, unknown>,
  ): Promise<ManagedDocument> {
    return this.send(
      `/admin/documents/${documentId}`,
      { body: JSON.stringify(payload), method: "PATCH" },
      managedDocumentSchema,
    );
  }

  async updateModule(
    moduleId: string,
    payload: Record<string, unknown>,
  ): Promise<ManagedModule> {
    return this.send(
      `/admin/modules/${moduleId}`,
      { body: JSON.stringify(payload), method: "PATCH" },
      managedModuleSchema,
    );
  }

  async updateAdministrativeUser(
    userId: string,
    payload: {
      accountStatus?: "active" | "suspended";
      reason: string;
      role?: "admin" | "docente" | "superadmin";
    },
  ): Promise<AdministrativeUserBase> {
    return this.send(
      `/admin/users/${userId}`,
      { body: JSON.stringify(payload), method: "PATCH" },
      administrativeUserBaseSchema,
    );
  }

  async updateAdministrativeUserAccessWindow(
    userId: string,
    payload: {
      accessExpiresAt?: string;
      accessStartAt?: string;
      reason: string;
    },
  ): Promise<AdministrativeUser> {
    return this.send(
      `/admin/users/${userId}/access-window`,
      { body: JSON.stringify(payload), method: "PATCH" },
      administrativeUserSchema,
    );
  }

  async listAdminModulePermissions(): Promise<AdminModulePermission[]> {
    return this.send(
      "/admin/module-permissions",
      { method: "GET" },
      adminModulePermissionSchema.array(),
    );
  }

  async setAdminModulePermission(
    userId: string,
    canAccess: boolean,
    reason: string,
  ): Promise<AdminModulePermission> {
    return this.send(
      `/admin/module-permissions/${userId}`,
      { body: JSON.stringify({ canAccess, reason }), method: "PATCH" },
      adminModulePermissionSchema,
    );
  }

  private async send<T>(
    path: string,
    options: { body?: RequestBody; method: string },
    schema?: ZodType<T>,
  ): Promise<T> {
    const response = await this.request(`${this.baseUrl}${path}`, {
      body: options.body,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.accessToken}`,
        ...(options.body && !(options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
      },
      method: options.method,
    });

    if (!response.ok) {
      throw new AdminApiError(response.status);
    }

    if (!schema) {
      return undefined as T;
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new AdminApiResponseError();
    }

    try {
      return schema.parse(payload);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new AdminApiResponseError();
      }

      throw error;
    }
  }
}
