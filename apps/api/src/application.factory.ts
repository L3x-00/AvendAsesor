import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Express } from 'express';
import helmet from 'helmet';

/** Reverse-proxy hops between the internet and the API on Render. */
export const TRUSTED_PROXY_HOPS = 1;

export function configureApplication(
  app: INestApplication,
  configService: ConfigService,
): void {
  // Render puts exactly one reverse proxy in front of the service. Trusting that
  // single hop makes `req.ip` the client address taken from the proxy-appended
  // X-Forwarded-For entry (earlier, client-supplied entries are ignored), so
  // anonymous requests are rate-limited per client instead of all sharing the
  // proxy address.
  const httpServer = app.getHttpAdapter().getInstance() as Express;
  httpServer.set('trust proxy', TRUSTED_PROXY_HOPS);
  app.use(helmet());
  app.enableCors({
    credentials: true,
    origin: configService.getOrThrow<string>('WEB_ORIGIN'),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      whitelist: true,
    }),
  );
}
