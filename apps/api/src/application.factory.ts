import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

export function configureApplication(
  app: INestApplication,
  configService: ConfigService,
): void {
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
