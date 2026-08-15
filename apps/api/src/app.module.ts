import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdministrationModule } from './administration/administration.module';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { validateEnvironment } from './config/environment.validation';
import { HealthModule } from './health/health.module';
import { DocumentsModule } from './documents/documents.module';
import { ModulesModule } from './modules/modules.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([
      {
        limit: 30,
        ttl: 60_000,
      },
    ]),
    AdministrationModule,
    AuthModule,
    AuthorizationModule,
    DocumentsModule,
    HealthModule,
    ModulesModule,
    UsersModule,
  ],
})
export class AppModule {}
