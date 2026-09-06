import "server-only";
import { ZodError, type ZodType } from "zod";
import { getAdminApiUrl } from "@/lib/admin-api/config";
import {
  consultationAttachmentDownloadSchema,
  consultationCaseDetailSchema,
  consultationCaseSummarySchema,
  consultationReviewPrioritySchema,
  consultationReportsDashboardSchema,
  consultationTopicSchema,
  type ConsultationCaseIssue,
  type ConsultationCaseKind,
  type ConsultationCaseStatus,
  type ConsultationPeriod,
  type ConsultationReportsDashboard,
  type ConsultationCaseDetail,
  type ConsultationCaseSummary,
  type ConsultationReviewPriority,
  type ConsultationTopic,
} from "./types";

export class ConsultationReportsApiError extends Error {
  constructor(readonly status: number) {
    super("Consultation reports API request failed.");
  }
}

export class ConsultationReportsApiResponseError extends Error {
  constructor() {
    super("Consultation reports API returned an invalid response.");
  }
}

export class ConsultationReportsApiClient {
  constructor(
    private readonly accessToken: string,
    private readonly baseUrl = getAdminApiUrl(),
    private readonly request: typeof fetch = fetch,
  ) {}

  async getDashboard(
    period: ConsultationPeriod,
  ): Promise<ConsultationReportsDashboard> {
    return this.send(
      `/admin/consultation-cases/dashboard?${new URLSearchParams({ period })}`,
      { method: "GET" },
      consultationReportsDashboardSchema,
    );
  }

  async getTopics(period: ConsultationPeriod): Promise<ConsultationTopic[]> {
    return this.send(
      `/admin/consultation-cases/dashboard/topics?${new URLSearchParams({ period })}`,
      { method: "GET" },
      consultationTopicSchema.array(),
    );
  }

  async getReviewPriorities(
    period: ConsultationPeriod,
  ): Promise<ConsultationReviewPriority[]> {
    return this.send(
      `/admin/consultation-cases/dashboard/review-priorities?${new URLSearchParams({ period })}`,
      { method: "GET" },
      consultationReviewPrioritySchema.array(),
    );
  }

  async listCases(filters: {
    issueType?: ConsultationCaseIssue;
    kind?: ConsultationCaseKind;
    limit?: number;
    moduleId?: string;
    offset?: number;
    period: ConsultationPeriod;
    query?: string;
    status?: ConsultationCaseStatus;
    submoduleId?: string;
  }): Promise<ConsultationCaseSummary[]> {
    const query = new URLSearchParams({
      limit: String(filters.limit ?? 50),
      offset: String(filters.offset ?? 0),
      period: filters.period,
    });
    if (filters.issueType) query.set("issueType", filters.issueType);
    if (filters.kind) query.set("kind", filters.kind);
    if (filters.moduleId) query.set("moduleId", filters.moduleId);
    if (filters.query?.trim()) query.set("query", filters.query.trim());
    if (filters.status) query.set("status", filters.status);
    if (filters.submoduleId) query.set("submoduleId", filters.submoduleId);
    return this.send(
      `/admin/consultation-cases?${query.toString()}`,
      { method: "GET" },
      consultationCaseSummarySchema.array(),
    );
  }

  async getCase(caseId: string): Promise<ConsultationCaseDetail> {
    return this.send(
      `/admin/consultation-cases/${encodeURIComponent(caseId)}`,
      { method: "GET" },
      consultationCaseDetailSchema,
    );
  }

  async updateCase(
    caseId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.send(`/admin/consultation-cases/${encodeURIComponent(caseId)}`, {
      body: JSON.stringify(payload),
      method: "PATCH",
    });
  }

  async linkDocument(caseId: string, documentId: string): Promise<void> {
    await this.send(
      `/admin/consultation-cases/${encodeURIComponent(caseId)}/documents`,
      {
        body: JSON.stringify({ documentId }),
        method: "POST",
      },
    );
  }

  async decideAttachment(
    caseId: string,
    attachmentId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.send(
      `/admin/consultation-cases/${encodeURIComponent(caseId)}/attachments/${encodeURIComponent(attachmentId)}/decision`,
      { body: JSON.stringify(payload), method: "POST" },
    );
  }

  async getAttachmentDownloadUrl(
    caseId: string,
    attachmentId: string,
    mode: "view" | "download" = "download",
  ): Promise<{ expiresAt: string; url: string }> {
    return this.send(
      `/admin/consultation-cases/${encodeURIComponent(caseId)}/attachments/${encodeURIComponent(attachmentId)}/download-url?${new URLSearchParams({ mode })}`,
      { method: "POST" },
      consultationAttachmentDownloadSchema,
    );
  }

  private async send<T>(
    path: string,
    options: RequestInit,
    schema?: ZodType<T>,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.request(`${this.baseUrl}${path}`, {
        ...options,
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.accessToken}`,
          ...(options.body instanceof FormData
            ? {}
            : { "Content-Type": "application/json" }),
          ...options.headers,
        },
      });
    } catch {
      throw new ConsultationReportsApiError(503);
    }
    if (!response.ok) throw new ConsultationReportsApiError(response.status);
    if (!schema) return undefined as T;
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ConsultationReportsApiResponseError();
    }
    try {
      return schema.parse(payload);
    } catch (error) {
      if (error instanceof ZodError)
        throw new ConsultationReportsApiResponseError();
      throw error;
    }
  }
}
