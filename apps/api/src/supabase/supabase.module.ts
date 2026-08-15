import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SUPABASE_AUTH_GATEWAY,
  SUPABASE_DOCUMENTS_GATEWAY,
  SUPABASE_MODULES_GATEWAY,
  SUPABASE_PROFILES_GATEWAY,
  SUPABASE_SERVER_CLIENT,
} from './supabase.constants';
import { SupabaseAuthGatewayAdapter } from './supabase-auth.gateway';
import { SupabaseDocumentsGatewayAdapter } from './supabase-documents.gateway';
import { SupabaseModulesGatewayAdapter } from './supabase-modules.gateway';
import { SupabaseProfilesGatewayAdapter } from './supabase-profiles.gateway';
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
  ],
  exports: [
    SUPABASE_AUTH_GATEWAY,
    SUPABASE_DOCUMENTS_GATEWAY,
    SUPABASE_MODULES_GATEWAY,
    SUPABASE_PROFILES_GATEWAY,
  ],
})
export class SupabaseModule {}
