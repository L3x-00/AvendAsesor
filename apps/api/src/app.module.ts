import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AdministrationModule } from './administration/administration.module';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { validateEnvironment } from './config/environment.validation';
import { HealthModule } from './health/health.module';
import { DocumentsModule } from './documents/documents.module';
import { ModulesModule } from './modules/modules.module';
import { ModulePermissionsModule } from './module-permissions/module-permissions.module';
import { UsersModule } from './users/users.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { RagModule } from './rag/rag.module';
import { ChatModule } from './chat/chat.module';
import { OperationsModule } from './operations/operations.module';
import { UserAdministrationModule } from './user-administration/user-administration.module';

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
    ScheduleModule.forRoot(),
    AdministrationModule,
    AuthModule,
    AuthorizationModule,
    ChatModule,
    DocumentsModule,
    HealthModule,
    IngestionModule,
    RagModule,
    ModulePermissionsModule,
    ModulesModule,
    OperationsModule,
    UserAdministrationModule,
    UsersModule,
  ],
})
export class AppModule {}
