import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
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
import { RagAdminModule } from './rag-admin/rag-admin.module';
import { ChatModule } from './chat/chat.module';
import { OperationsModule } from './operations/operations.module';
import { UserAdministrationModule } from './user-administration/user-administration.module';
import { ConsultationCasesModule } from './consultation-cases/consultation-cases.module';
import { ThrottlingModule } from './throttling/throttling.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ThrottlingModule,
    ScheduleModule.forRoot(),
    AdministrationModule,
    AuthModule,
    AuthorizationModule,
    ChatModule,
    ConsultationCasesModule,
    DocumentsModule,
    HealthModule,
    IngestionModule,
    RagModule,
    RagAdminModule,
    ModulePermissionsModule,
    ModulesModule,
    OperationsModule,
    UserAdministrationModule,
    UsersModule,
  ],
})
export class AppModule {}
