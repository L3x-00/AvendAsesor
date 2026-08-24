import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { configureApplication } from './application.factory';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  configureApplication(app, configService);

  // Render forwards traffic through the address exposed by the service. Binding
  // explicitly to all IPv4 interfaces preserves local behavior and avoids a
  // deployment that listens only on loopback.
  await app.listen(configService.getOrThrow<number>('PORT'), '0.0.0.0');
}

void bootstrap().catch((error: unknown) => {
  console.error('API bootstrap failed.', error);
  process.exitCode = 1;
});
