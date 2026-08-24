import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SUPABASE_AUTH_GATEWAY,
  SUPABASE_CHAT_GATEWAY,
  SUPABASE_DOCUMENTS_GATEWAY,
  SUPABASE_FAQ_MEMORY_GATEWAY,
  SUPABASE_HEALTH_GATEWAY,
  SUPABASE_INGESTION_GATEWAY,
  SUPABASE_MODULES_GATEWAY,
  SUPABASE_OPERATIONS_GATEWAY,
  SUPABASE_PROFILES_GATEWAY,
  SUPABASE_RETRIEVAL_GATEWAY,
  SUPABASE_SERVER_CLIENT,
  SUPABASE_USER_ADMINISTRATION_GATEWAY,
} from './supabase.constants';
import { SupabaseAuthGatewayAdapter } from './supabase-auth.gateway';
import { SupabaseChatGatewayAdapter } from './supabase-chat.gateway';
import { SupabaseDocumentsGatewayAdapter } from './supabase-documents.gateway';
import { SupabaseFaqMemoryGatewayAdapter } from './supabase-faq-memory.gateway';
import { SupabaseHealthGatewayAdapter } from './supabase-health.gateway';
import { SupabaseIngestionGatewayAdapter } from './supabase-ingestion.gateway';
import { SupabaseModulesGatewayAdapter } from './supabase-modules.gateway';
import { SupabaseOperationsGatewayAdapter } from './supabase-operations.gateway';
import { SupabaseProfilesGatewayAdapter } from './supabase-profiles.gateway';
import { SupabaseRetrievalGatewayAdapter } from './supabase-retrieval.gateway';
import { SupabaseUserAdministrationGatewayAdapter } from './supabase-user-administration.gateway';
import {
  createSupabaseServerClient,
  type SupabaseServerClient,
} from './supabase.server-client';

@Module({
  providers: [
    {
      provide: SUPABASE_SERVER_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): SupabaseServerClient | null =>
        createSupabaseServerClient(
          configService.get<string>('SUPABASE_URL'),
          configService.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
        ),
    },
    {
      provide: SUPABASE_HEALTH_GATEWAY,
      inject: [SUPABASE_SERVER_CLIENT],
      useFactory: (client: SupabaseServerClient | null) =>
        new SupabaseHealthGatewayAdapter(
          client
            ? {
                from: (table: 'profiles') => client.from(table),
              }
            : null,
        ),
    },
    {
      provide: SUPABASE_AUTH_GATEWAY,
      inject: [SUPABASE_SERVER_CLIENT],
      useFactory: (client: SupabaseServerClient | null) =>
        new SupabaseAuthGatewayAdapter(client),
    },
    {
      provide: SUPABASE_PROFILES_GATEWAY,
      inject: [SUPABASE_SERVER_CLIENT],
      useFactory: (client: SupabaseServerClient | null) =>
        new SupabaseProfilesGatewayAdapter(
          client
            ? {
                from: (table: 'profiles') => client.from(table),
                rpc: (
                  functionName: 'touch_profile_last_access',
                  args: { p_user_id: string },
                ) => client.rpc(functionName, args),
              }
            : null,
        ),
    },
    {
      provide: SUPABASE_MODULES_GATEWAY,
      inject: [SUPABASE_SERVER_CLIENT],
      useFactory: (client: SupabaseServerClient | null) =>
        new SupabaseModulesGatewayAdapter(client),
    },
    {
      provide: SUPABASE_DOCUMENTS_GATEWAY,
      inject: [SUPABASE_SERVER_CLIENT],
      useFactory: (client: SupabaseServerClient | null) =>
        new SupabaseDocumentsGatewayAdapter(client),
    },
    {
      provide: SUPABASE_INGESTION_GATEWAY,
      inject: [SUPABASE_SERVER_CLIENT],
      useFactory: (client: SupabaseServerClient | null) =>
        new SupabaseIngestionGatewayAdapter(client),
    },
    {
      provide: SUPABASE_RETRIEVAL_GATEWAY,
      inject: [SUPABASE_SERVER_CLIENT],
      useFactory: (client: SupabaseServerClient | null) =>
        new SupabaseRetrievalGatewayAdapter(client),
    },
    {
      provide: SUPABASE_CHAT_GATEWAY,
      inject: [SUPABASE_SERVER_CLIENT],
      useFactory: (client: SupabaseServerClient | null) =>
        new SupabaseChatGatewayAdapter(client),
    },
    {
      provide: SUPABASE_FAQ_MEMORY_GATEWAY,
      inject: [SUPABASE_SERVER_CLIENT],
      useFactory: (client: SupabaseServerClient | null) =>
        new SupabaseFaqMemoryGatewayAdapter(client),
    },
    {
      provide: SUPABASE_OPERATIONS_GATEWAY,
      inject: [SUPABASE_SERVER_CLIENT],
      useFactory: (client: SupabaseServerClient | null) =>
        new SupabaseOperationsGatewayAdapter(client),
    },
    {
      provide: SUPABASE_USER_ADMINISTRATION_GATEWAY,
      inject: [SUPABASE_SERVER_CLIENT],
      useFactory: (client: SupabaseServerClient | null) =>
        new SupabaseUserAdministrationGatewayAdapter(client),
    },
  ],
  exports: [
    SUPABASE_AUTH_GATEWAY,
    SUPABASE_CHAT_GATEWAY,
    SUPABASE_DOCUMENTS_GATEWAY,
    SUPABASE_FAQ_MEMORY_GATEWAY,
    SUPABASE_HEALTH_GATEWAY,
    SUPABASE_INGESTION_GATEWAY,
    SUPABASE_MODULES_GATEWAY,
    SUPABASE_OPERATIONS_GATEWAY,
    SUPABASE_PROFILES_GATEWAY,
    SUPABASE_RETRIEVAL_GATEWAY,
    SUPABASE_USER_ADMINISTRATION_GATEWAY,
  ],
})
export class SupabaseModule {}
