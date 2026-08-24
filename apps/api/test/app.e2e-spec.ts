import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApplication } from './../src/application.factory';
import { ConfigService } from '@nestjs/config';
import {
  AuthorizationService,
  type AuthorizationContext,
} from './../src/authorization';
import { ModulesService } from './../src/modules/modules.service';
import type { ManagedModule } from './../src/modules/domain/module';
import { DocumentsService } from './../src/documents/documents.service';
import type {
  ManagedDocument,
  ManagedDocumentDetails,
} from './../src/documents/domain/document';
import { ChatService } from './../src/chat/chat.service';
import { OperationsService } from './../src/operations/operations.service';

describe('API endpoints (e2e)', () => {
  let app: INestApplication<App>;
  const resolveContext = jest.fn<Promise<AuthorizationContext>, [string]>();
  const modulesService = {
    create: jest.fn<Promise<ManagedModule>, never[]>(),
    findOne: jest.fn<Promise<ManagedModule>, [string]>(),
    list: jest.fn<Promise<ManagedModule[]>, never[]>(),
    logicalDelete: jest.fn<Promise<void>, never[]>(),
    setStatus: jest.fn<Promise<ManagedModule>, never[]>(),
    update: jest.fn<Promise<ManagedModule>, never[]>(),
  };
  const documentsService = {
    addVersion: jest.fn<Promise<ManagedDocument>, never[]>(),
    create: jest.fn<Promise<ManagedDocument>, never[]>(),
    createDownloadUrl: jest.fn<
      Promise<{ expiresAt: string; url: string; versionId: string }>,
      never[]
    >(),
    findOne: jest.fn<Promise<ManagedDocumentDetails>, [string]>(),
    linkModule: jest.fn<Promise<void>, never[]>(),
    list: jest.fn<Promise<ManagedDocument[]>, never[]>(),
    logicalDelete: jest.fn<Promise<void>, never[]>(),
    setStatus: jest.fn<Promise<ManagedDocument>, never[]>(),
    unlinkModule: jest.fn<Promise<void>, never[]>(),
    updateMetadata: jest.fn<Promise<ManagedDocument>, never[]>(),
  };
  const chatService = {
    getConversation: jest.fn<
      Promise<unknown>,
      [string, AuthorizationContext]
    >(),
    listConversations: jest.fn<
      Promise<unknown[]>,
      [number | undefined, AuthorizationContext]
    >(),
    listModules: jest.fn<Promise<unknown[]>, never[]>(),
    stream: jest.fn(),
  };
  const operationsService = {
    getMetrics: jest.fn<Promise<unknown>, [AuthorizationContext]>(),
    listUnansweredQuestions: jest.fn<
      Promise<unknown[]>,
      [Record<string, unknown>, AuthorizationContext]
    >(),
    reviewUnansweredQuestion: jest.fn<
      Promise<void>,
      [string, Record<string, unknown>, AuthorizationContext]
    >(),
  };

  const moduleRecord: ManagedModule = {
    code: 'MODULE_TEST',
    createdAt: '2026-08-09T00:00:00.000Z',
    createdBy: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
    deletedAt: null,
    deletedBy: null,
    deletionReason: null,
    description: null,
    id: '78d7f37f-1d50-4707-8f4b-e701d450e83e',
    isActive: true,
    isDeleted: false,
    metadata: {},
    name: 'Módulo de prueba',
    parentModuleId: null,
    sortOrder: 0,
    updatedAt: '2026-08-09T00:00:00.000Z',
    updatedBy: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
  };
  const documentRecord: ManagedDocument = {
    articleReference: null,
    createdAt: '2026-08-09T00:00:00.000Z',
    createdBy: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    currentVersionId: 'a55ff9d0-0193-4d76-a6d4-6e61ee8769d4',
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
    deletedAt: null,
    deletedBy: null,
    deletionReason: null,
    documentType: 'NORMATIVE',
    id: '644adb97-6ac3-4c1c-bcf4-efa5470bb9c5',
    isDeleted: false,
    issuanceYear: 2026,
    issuingEntity: 'AVEND',
    metadata: {},
    publicationStatus: 'active',
    resolutionNumber: null,
    title: 'Documento de prueba',
    updatedAt: '2026-08-09T00:00:00.000Z',
    updatedBy: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthorizationService)
      .useValue({ resolveContext })
      .overrideProvider(ModulesService)
      .useValue(modulesService)
      .overrideProvider(DocumentsService)
      .useValue(documentsService)
      .overrideProvider(ChatService)
      .useValue(chatService)
      .overrideProvider(OperationsService)
      .useValue(operationsService)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app, moduleFixture.get(ConfigService));
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ service: 'avend-asesor-api', status: 'ok' });
  });

  it('/health/ready (GET) fails closed without a server data-store configuration', () => {
    return request(app.getHttpServer())
      .get('/health/ready')
      .expect(503)
      .expect({
        error: 'Service Unavailable',
        message: 'Service dependencies are unavailable.',
        statusCode: 503,
      });
  });

  it('/admin/access denies a request without a bearer token', () => {
    return request(app.getHttpServer()).get('/admin/access').expect(401);
  });

  it('/admin/access denies an altered authorization scheme', () => {
    return request(app.getHttpServer())
      .get('/admin/access')
      .set('Authorization', 'Basic altered-token')
      .expect(401);
  });

  it('/admin/access denies a docente token', async () => {
    resolveContext.mockResolvedValue({
      email: 'docente@example.com',
      emailConfirmedAt: '2026-08-09T00:00:00.000Z',
      role: 'docente',
      userId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    });

    await request(app.getHttpServer())
      .get('/admin/access')
      .set('Authorization', 'Bearer docente-token')
      .expect(403);
  });

  it('/admin/access admits an admin token', async () => {
    resolveContext.mockResolvedValue({
      email: 'admin@example.com',
      emailConfirmedAt: '2026-08-09T00:00:00.000Z',
      role: 'admin',
      userId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    });

    await request(app.getHttpServer())
      .get('/admin/access')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect({ role: 'admin', status: 'authorized' });
  });

  it('/admin/system admits only a superadmin token', async () => {
    resolveContext.mockResolvedValue({
      email: 'superadmin@example.com',
      emailConfirmedAt: '2026-08-09T00:00:00.000Z',
      role: 'superadmin',
      userId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    });

    await request(app.getHttpServer())
      .get('/admin/system')
      .set('Authorization', 'Bearer superadmin-token')
      .expect(200)
      .expect({ status: 'authorized' });
  });

  it('/admin/system denies an admin token', async () => {
    resolveContext.mockResolvedValue({
      email: 'admin@example.com',
      emailConfirmedAt: '2026-08-09T00:00:00.000Z',
      role: 'admin',
      userId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    });

    await request(app.getHttpServer())
      .get('/admin/system')
      .set('Authorization', 'Bearer admin-token')
      .expect(403);
  });

  it('/admin/access applies the administrative rate limit', async () => {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await request(app.getHttpServer()).get('/admin/access').expect(401);
    }

    await request(app.getHttpServer()).get('/admin/access').expect(429);
  });

  it('/admin/modules denies a docente before executing the module service', async () => {
    resolveContext.mockResolvedValue({
      email: 'docente@example.com',
      emailConfirmedAt: '2026-08-09T00:00:00.000Z',
      role: 'docente',
      userId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    });

    await request(app.getHttpServer())
      .get('/admin/modules')
      .set('Authorization', 'Bearer docente-token')
      .expect(403);

    expect(modulesService.list).not.toHaveBeenCalled();
  });

  it('/admin/modules denies unauthenticated module access', () => {
    return request(app.getHttpServer()).get('/admin/modules').expect(401);
  });

  it('/admin/modules lists modules for an administrator', async () => {
    resolveContext.mockResolvedValue({
      email: 'admin@example.com',
      emailConfirmedAt: '2026-08-09T00:00:00.000Z',
      role: 'admin',
      userId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    });
    modulesService.list.mockResolvedValue([moduleRecord]);

    await request(app.getHttpServer())
      .get('/admin/modules?status=active')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect([moduleRecord]);

    expect(modulesService.list).toHaveBeenCalledWith({ status: 'active' });
  });

  it('/admin/operations accepts numeric query parameters from the protected web client', async () => {
    resolveContext.mockResolvedValue({
      email: 'admin@example.com',
      emailConfirmedAt: '2026-08-09T00:00:00.000Z',
      role: 'admin',
      userId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    });
    operationsService.listUnansweredQuestions.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get(
        '/admin/operations/unanswered-questions?limit=100&status=pending_review',
      )
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect([]);

    expect(operationsService.listUnansweredQuestions).toHaveBeenCalledWith(
      { limit: 100, status: 'pending_review' },
      expect.objectContaining({ role: 'admin' }),
    );
  });

  it('/admin/modules validates and creates a module for a superadmin', async () => {
    resolveContext.mockResolvedValue({
      email: 'superadmin@example.com',
      emailConfirmedAt: '2026-08-09T00:00:00.000Z',
      role: 'superadmin',
      userId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    });
    modulesService.create.mockResolvedValue(moduleRecord);

    await request(app.getHttpServer())
      .post('/admin/modules')
      .set('Authorization', 'Bearer superadmin-token')
      .send({ code: 'module_test', name: ' Módulo de prueba ' })
      .expect(201)
      .expect(moduleRecord);

    expect(modulesService.create).toHaveBeenCalledWith(
      { code: 'MODULE_TEST', name: 'Módulo de prueba' },
      expect.objectContaining({ role: 'superadmin' }),
    );
  });

  it('/admin/modules rejects malformed payloads before the service executes', async () => {
    resolveContext.mockResolvedValue({
      email: 'admin@example.com',
      emailConfirmedAt: '2026-08-09T00:00:00.000Z',
      role: 'admin',
      userId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    });

    await request(app.getHttpServer())
      .post('/admin/modules')
      .set('Authorization', 'Bearer admin-token')
      .send({ code: 'invalid code', name: 'x', unexpected: true })
      .expect(400);

    expect(modulesService.create).not.toHaveBeenCalled();
  });

  it('/admin/modules changes status and logically deletes through protected routes', async () => {
    resolveContext.mockResolvedValue({
      email: 'admin@example.com',
      emailConfirmedAt: '2026-08-09T00:00:00.000Z',
      role: 'admin',
      userId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    });
    modulesService.setStatus.mockResolvedValue(moduleRecord);
    modulesService.logicalDelete.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .patch(`/admin/modules/${moduleRecord.id}/status`)
      .set('Authorization', 'Bearer admin-token')
      .send({ isActive: false, reason: 'Actualización normativa' })
      .expect(200)
      .expect(moduleRecord);
    await request(app.getHttpServer())
      .delete(`/admin/modules/${moduleRecord.id}`)
      .set('Authorization', 'Bearer admin-token')
      .send({ reason: 'Retirado del catálogo' })
      .expect(204);

    expect(modulesService.setStatus).toHaveBeenCalled();
    expect(modulesService.logicalDelete).toHaveBeenCalled();
  });

  it('/admin/documents denies a docente before invoking document behavior', async () => {
    resolveContext.mockResolvedValue({
      email: 'docente@example.com',
      emailConfirmedAt: '2026-08-09T00:00:00.000Z',
      role: 'docente',
      userId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    });

    await request(app.getHttpServer())
      .get('/admin/documents')
      .set('Authorization', 'Bearer docente-token')
      .expect(403);

    expect(documentsService.list).not.toHaveBeenCalled();
  });

  it('/admin/documents rejects requests without a bearer token', () => {
    return request(app.getHttpServer()).get('/admin/documents').expect(401);
  });

  it('/admin/documents accepts validated PDF upload requests for an administrator', async () => {
    resolveContext.mockResolvedValue({
      email: 'admin@example.com',
      emailConfirmedAt: '2026-08-09T00:00:00.000Z',
      role: 'admin',
      userId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    });
    documentsService.create.mockResolvedValue(documentRecord);

    await request(app.getHttpServer())
      .post('/admin/documents')
      .set('Authorization', 'Bearer admin-token')
      .field('documentType', 'normative')
      .field('moduleIds', '[]')
      .field('title', ' Documento de prueba ')
      .attach('file', Buffer.from('%PDF-1.7'), 'documento.pdf')
      .expect(201)
      .expect(documentRecord);

    expect(documentsService.create).toHaveBeenCalledWith(
      {
        documentType: 'NORMATIVE',
        moduleIds: [],
        title: 'Documento de prueba',
      },
      expect.objectContaining({ originalname: 'documento.pdf' }),
      expect.objectContaining({ role: 'admin' }),
    );
  });

  it('/admin/documents validates upload fields before the service executes', async () => {
    resolveContext.mockResolvedValue({
      email: 'admin@example.com',
      emailConfirmedAt: '2026-08-09T00:00:00.000Z',
      role: 'admin',
      userId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    });

    await request(app.getHttpServer())
      .post('/admin/documents')
      .set('Authorization', 'Bearer admin-token')
      .field('documentType', 'invalid type')
      .field('unexpected', 'field')
      .field('title', 'x')
      .attach('file', Buffer.from('%PDF-1.7'), 'documento.pdf')
      .expect(400);

    expect(documentsService.create).not.toHaveBeenCalled();
  });

  it('/admin/documents protects version, link, status, download and deletion routes', async () => {
    resolveContext.mockResolvedValue({
      email: 'superadmin@example.com',
      emailConfirmedAt: '2026-08-09T00:00:00.000Z',
      role: 'superadmin',
      userId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    });
    documentsService.addVersion.mockResolvedValue(documentRecord);
    documentsService.createDownloadUrl.mockResolvedValue({
      expiresAt: '2026-08-09T00:01:00.000Z',
      url: 'http://signed.local/document',
      versionId: documentRecord.currentVersionId!,
    });
    documentsService.setStatus.mockResolvedValue({
      ...documentRecord,
      publicationStatus: 'inactive',
    });
    documentsService.updateMetadata.mockResolvedValue(documentRecord);
    documentsService.logicalDelete.mockResolvedValue(undefined);
    documentsService.linkModule.mockResolvedValue(undefined);
    documentsService.unlinkModule.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post(`/admin/documents/${documentRecord.id}/versions`)
      .set('Authorization', 'Bearer superadmin-token')
      .attach('file', Buffer.from('%PDF-1.7'), 'documento-v2.pdf')
      .expect(201);
    await request(app.getHttpServer())
      .post(`/admin/documents/${documentRecord.id}/download-url`)
      .set('Authorization', 'Bearer superadmin-token')
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/admin/documents/${documentRecord.id}/modules`)
      .set('Authorization', 'Bearer superadmin-token')
      .send({ moduleId: '30dd8519-3b3a-4e64-a7dc-2b82578eab95' })
      .expect(204);
    await request(app.getHttpServer())
      .patch(`/admin/documents/${documentRecord.id}/status`)
      .set('Authorization', 'Bearer superadmin-token')
      .send({ isActive: false, reason: 'Revisión normativa' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/admin/documents/${documentRecord.id}`)
      .set('Authorization', 'Bearer superadmin-token')
      .send({ title: 'Documento actualizado' })
      .expect(200);
    await request(app.getHttpServer())
      .delete(
        `/admin/documents/${documentRecord.id}/modules/30dd8519-3b3a-4e64-a7dc-2b82578eab95`,
      )
      .set('Authorization', 'Bearer superadmin-token')
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/admin/documents/${documentRecord.id}`)
      .set('Authorization', 'Bearer superadmin-token')
      .send({ reason: 'Documento retirado' })
      .expect(204);

    expect(documentsService.addVersion).toHaveBeenCalled();
    expect(documentsService.createDownloadUrl).toHaveBeenCalled();
    expect(documentsService.linkModule).toHaveBeenCalled();
    expect(documentsService.setStatus).toHaveBeenCalled();
    expect(documentsService.updateMetadata).toHaveBeenCalled();
    expect(documentsService.unlinkModule).toHaveBeenCalled();
    expect(documentsService.logicalDelete).toHaveBeenCalled();
  });

  it('/chat denies a missing bearer token before reaching the chat service', async () => {
    await request(app.getHttpServer()).get('/chat/modules').expect(401);

    expect(chatService.listModules).not.toHaveBeenCalled();
  });

  it('/chat allows a confirmed docente to read the minimal module projection', async () => {
    resolveContext.mockResolvedValue({
      email: 'docente@example.com',
      emailConfirmedAt: '2026-08-22T00:00:00.000Z',
      role: 'docente',
      userId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    });
    chatService.listModules.mockResolvedValue([
      {
        code: 'LICENSES',
        id: '78d7f37f-1d50-4707-8f4b-e701d450e83e',
        name: 'Licencias',
        parentModuleId: null,
        sortOrder: 0,
      },
    ]);

    await request(app.getHttpServer())
      .get('/chat/modules')
      .set('Authorization', 'Bearer docente-token')
      .expect(200)
      .expect([
        {
          code: 'LICENSES',
          id: '78d7f37f-1d50-4707-8f4b-e701d450e83e',
          name: 'Licencias',
          parentModuleId: null,
          sortOrder: 0,
        },
      ]);
  });

  it('/chat/stream validates input and emits structured SSE for a docente', async () => {
    resolveContext.mockResolvedValue({
      email: 'docente@example.com',
      emailConfirmedAt: '2026-08-22T00:00:00.000Z',
      role: 'docente',
      userId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
    });

    await request(app.getHttpServer())
      .post('/chat/stream')
      .set('Authorization', 'Bearer docente-token')
      .send({ question: '' })
      .expect(400);

    chatService.stream.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield {
          data: { conversationId: '9a15a92-9899-4ee2-81e0-30d7c3f7677c' },
          type: 'conversation',
        };
        yield {
          data: { text: 'Respuesta con sustento.' },
          type: 'token',
        };
        yield {
          data: {
            conversationId: '9a15a92-9899-4ee2-81e0-30d7c3f7677c',
            messageId: 'aa15a92-9899-4ee2-81e0-30d7c3f7677c',
            provider: 'openai',
          },
          type: 'done',
        };
      },
    });

    const response = await request(app.getHttpServer())
      .post('/chat/stream')
      .set('Authorization', 'Bearer docente-token')
      .send({ question: 'Consulta válida' })
      .expect('Content-Type', /text\/event-stream/)
      .expect(200);

    expect(response.text).toContain('event: conversation');
    expect(response.text).toContain('event: token');
    expect(response.text).toContain('event: done');
  });

  afterEach(async () => {
    await app.close();
  });
});
