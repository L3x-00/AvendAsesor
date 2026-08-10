import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApplication } from './../src/application.factory';
import { AppModule } from './../src/app.module';
import {
  AuthorizationService,
  type AuthorizationContext,
} from './../src/authorization';

describe('API endpoints (e2e)', () => {
  let app: INestApplication<App>;
  const resolveContext = jest.fn<Promise<AuthorizationContext>, [string]>();

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthorizationService)
      .useValue({ resolveContext })
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

  afterEach(async () => {
    await app.close();
  });
});
