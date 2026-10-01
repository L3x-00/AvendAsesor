import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApplication } from './../src/application.factory';
import {
  AuthorizationService,
  type AuthorizationContext,
} from './../src/authorization';
import { ModulesService } from './../src/modules/modules.service';

/**
 * Rate limiting must be per person (TSK-0070): one administrator, an anonymous
 * caller or someone inventing tokens must never consume another person's quota.
 * AdministrationController allows 10 requests per minute per handler.
 */
describe('API rate limiting (e2e)', () => {
  let app: INestApplication<App>;
  const resolveContext = jest.fn<Promise<AuthorizationContext>, [string]>();
  const modulesService = {
    listSummaries: jest.fn<Promise<unknown[]>, never[]>(),
    logicalDelete: jest.fn<Promise<void>, never[]>(),
  };

  const adminContext = (userId: string): AuthorizationContext => ({
    email: `${userId}@example.com`,
    emailConfirmedAt: '2026-08-09T00:00:00.000Z',
    modulesAccess: true,
    role: 'admin',
    userId,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    resolveContext.mockImplementation((token) =>
      token.startsWith('valid-')
        ? Promise.resolve(adminContext(token))
        : Promise.reject(new UnauthorizedException()),
    );
    modulesService.listSummaries.mockResolvedValue([]);
    modulesService.logicalDelete.mockResolvedValue(undefined);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthorizationService)
      .useValue({ resolveContext })
      .overrideProvider(ModulesService)
      .useValue(modulesService)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app, moduleFixture.get(ConfigService));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const getAccess = (token: string | null, forwardedFor?: string) => {
    const call = request(app.getHttpServer()).get('/admin/access');

    if (token) {
      void call.set('Authorization', `Bearer ${token}`);
    }

    if (forwardedFor) {
      void call.set('X-Forwarded-For', forwardedFor);
    }

    return call;
  };

  it('does not let one administrator exhaust the quota of another one behind the same address', async () => {
    let firstBlockedAt = 0;

    for (let attempt = 1; attempt <= 15 && !firstBlockedAt; attempt += 1) {
      const response = await getAccess('valid-admin-a');

      if (response.status === 429) {
        firstBlockedAt = attempt;
      } else {
        expect(response.status).toBe(200);
      }
    }

    expect(firstBlockedAt).toBeGreaterThan(10);

    await getAccess('valid-admin-b').expect(200);
    await getAccess('valid-admin-b').expect(200);
  });

  it('keeps invented tokens in the bucket of their address, so they cannot buy fresh quota', async () => {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await getAccess(`forged-${attempt}`).expect(401);
    }

    await getAccess('forged-11').expect(429);
  });

  it('limits anonymous callers per client address taken from the proxy hop, ignoring spoofed entries', async () => {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await getAccess(null, `10.0.0.${attempt}, 198.51.100.1`).expect(401);
    }

    // A different spoofed left-most entry does not escape the block…
    await getAccess(null, '10.9.9.9, 198.51.100.1').expect(429);
    // …while another real client keeps its own quota.
    await getAccess(null, '198.51.100.2').expect(401);
  });

  it('gives module reads a per-user quota of 60 per minute and keeps mutations at 10', async () => {
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      const response = await request(app.getHttpServer())
        .get('/admin/modules/summary')
        .set('Authorization', 'Bearer valid-admin-reader')
        .expect(200);

      expect(response.headers['x-ratelimit-limit']).toBe('60');
    }

    const mutation = await request(app.getHttpServer())
      .delete('/admin/modules/78d7f37f-1d50-4707-8f4b-e701d450e83e')
      .set('Authorization', 'Bearer valid-admin-reader')
      .send({ reason: 'Prueba de límite' });

    expect(mutation.headers['x-ratelimit-limit']).toBe('10');
  });
});
