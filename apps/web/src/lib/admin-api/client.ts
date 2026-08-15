import 'server-only';
import { ZodError, type ZodType } from 'zod';
import { getAdminApiUrl } from './config';
import {
  downloadUrlSchema,
  managedDocumentDetailsSchema,
  managedDocumentSchema,
  managedModuleSchema,
  type DownloadUrl,
  type ManagedDocument,
  type ManagedDocumentDetails,
  type ManagedModule,
} from './types';

export class AdminApiError extends Error {
  constructor(readonly status: number) {
    super('Administrative API request failed.');
  }
}

export class AdminApiResponseError extends Error {
  constructor() {
    super('Administrative API returned an invalid response.');
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
      { body: payload, method: 'POST' },
      managedDocumentSchema,
    );
  }

  async createDocument(payload: FormData): Promise<ManagedDocument> {
    return this.send(
      '/admin/documents',
      { body: payload, method: 'POST' },
      managedDocumentSchema,
    );
  }

  async createModule(payload: Record<string, unknown>): Promise<ManagedModule> {
    return this.send(
      '/admin/modules',
      { body: JSON.stringify(payload), method: 'POST' },
      managedModuleSchema,
    );
  }

  async deleteDocument(documentId: string, reason: string): Promise<void> {
    await this.send(
      `/admin/documents/${documentId}`,
      { body: JSON.stringify({ reason }), method: 'DELETE' },
    );
  }

  async deleteModule(moduleId: string, reason: string): Promise<void> {
    await this.send(
      `/admin/modules/${moduleId}`,
      { body: JSON.stringify({ reason }), method: 'DELETE' },
    );
  }

  async getDocument(documentId: string): Promise<ManagedDocumentDetails> {
    return this.send(
      `/admin/documents/${documentId}`,
      { method: 'GET' },
      managedDocumentDetailsSchema,
    );
  }

  async getDownloadUrl(
    documentId: string,
    versionId?: string,
  ): Promise<DownloadUrl> {
    return this.send(
      `/admin/documents/${documentId}/download-url`,
      {
        body: JSON.stringify(versionId ? { versionId } : {}),
        method: 'POST',
      },
      downloadUrlSchema,
    );
  }

  async linkDocumentModule(documentId: string, moduleId: string): Promise<void> {
    await this.send(`/admin/documents/${documentId}/modules`, {
      body: JSON.stringify({ moduleId }),
      method: 'POST',
    });
  }

  async listDocuments(status: 'active' | 'all' | 'inactive' = 'all') {
    const query = new URLSearchParams({ limit: '100', offset: '0', status });

    return this.send(
      `/admin/documents?${query.toString()}`,
      { method: 'GET' },
      managedDocumentSchema.array(),
    );
  }

  async listModules(status: 'active' | 'all' | 'inactive' = 'all') {
    const query = new URLSearchParams({ status });

    return this.send(
      `/admin/modules?${query.toString()}`,
      { method: 'GET' },
      managedModuleSchema.array(),
    );
  }

  async setDocumentStatus(
    documentId: string,
    isActive: boolean,
    reason?: string,
  ): Promise<ManagedDocument> {
    return this.send(
      `/admin/documents/${documentId}/status`,
      { body: JSON.stringify({ isActive, reason }), method: 'PATCH' },
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
      { body: JSON.stringify({ isActive, reason }), method: 'PATCH' },
      managedModuleSchema,
    );
  }

  async unlinkDocumentModule(
    documentId: string,
    moduleId: string,
  ): Promise<void> {
    await this.send(`/admin/documents/${documentId}/modules/${moduleId}`, {
      method: 'DELETE',
    });
  }

  async updateDocument(
    documentId: string,
    payload: Record<string, unknown>,
  ): Promise<ManagedDocument> {
    return this.send(
      `/admin/documents/${documentId}`,
      { body: JSON.stringify(payload), method: 'PATCH' },
      managedDocumentSchema,
    );
  }

  async updateModule(
    moduleId: string,
    payload: Record<string, unknown>,
  ): Promise<ManagedModule> {
    return this.send(
      `/admin/modules/${moduleId}`,
      { body: JSON.stringify(payload), method: 'PATCH' },
      managedModuleSchema,
    );
  }

  private async send<T>(
    path: string,
    options: { body?: RequestBody; method: string },
    schema?: ZodType<T>,
  ): Promise<T> {
    const response = await this.request(`${this.baseUrl}${path}`, {
      body: options.body,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
        ...(options.body && !(options.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
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
