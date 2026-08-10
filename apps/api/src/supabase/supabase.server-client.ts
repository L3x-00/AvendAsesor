import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { UserRole } from '../users/domain/user-profile';

export interface SupabaseDatabase {
  public: {
    Tables: {
      profiles: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          role: UserRole;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          full_name: string;
          id: string;
          role?: UserRole;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
          role?: UserRole;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: { app_role: UserRole };
    CompositeTypes: Record<string, never>;
  };
}

export type SupabaseServerClient = SupabaseClient<SupabaseDatabase>;

export function createSupabaseServerClient(
  url: string | undefined,
  serviceRoleKey: string | undefined,
): SupabaseServerClient | null {
  if (!url && !serviceRoleKey) {
    return null;
  }

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase server configuration is invalid.');
  }

  return createClient<SupabaseDatabase>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
