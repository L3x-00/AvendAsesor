import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { configureApplication } from './application.factory';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  configureApplication(app, configService);

  await app.listen(configService.getOrThrow<number>('PORT'));
}

void bootstrap().catch((error: unknown) => {
  console.error('API bootstrap failed.', error);
  process.exitCode = 1;
});
