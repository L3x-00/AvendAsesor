import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { UserRole } from '../users/domain/user-profile';

export type Json =
  | boolean
  | null
  | number
  | string
  | { [key: string]: Json | undefined }
  | Json[];

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
      modules: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          deactivated_at: string | null;
          deactivated_by: string | null;
          deactivation_reason: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          deletion_reason: string | null;
          description: string | null;
          id: string;
          is_active: boolean;
          is_deleted: boolean;
          metadata: Json;
          name: string;
          parent_module_id: string | null;
          sort_order: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          deactivated_at?: string | null;
          deactivated_by?: string | null;
          deactivation_reason?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          deletion_reason?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_deleted?: boolean;
          metadata?: Json;
          name: string;
          parent_module_id?: string | null;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          deactivated_at?: string | null;
          deactivated_by?: string | null;
          deactivation_reason?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          deletion_reason?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_deleted?: boolean;
          metadata?: Json;
          name?: string;
          parent_module_id?: string | null;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          article_reference: string | null;
          created_at: string;
          created_by: string | null;
          current_version_id: string | null;
          deactivated_at: string | null;
          deactivated_by: string | null;
          deactivation_reason: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          deletion_reason: string | null;
          document_type: string;
          id: string;
          is_deleted: boolean;
          issuance_year: number | null;
          issuing_entity: string | null;
          metadata: Json;
          publication_status: 'active' | 'inactive';
          resolution_number: string | null;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      document_versions: {
        Row: {
          document_id: string;
          file_size_bytes: number;
          id: string;
          ingestion_status: 'pending';
          ingestion_updated_at: string;
          mime_type: 'application/pdf';
          original_file_name: string;
          page_count: number;
          sha256: string;
          storage_bucket: 'normative-documents';
          storage_path: string;
          uploaded_at: string;
          uploaded_by: string | null;
          version_number: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      document_modules: {
        Row: {
          created_at: string;
          created_by: string | null;
          document_id: string;
          module_id: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      add_document_version: {
        Args: {
          p_actor_id: string;
          p_document_id: string;
          p_file_size_bytes: number;
          p_original_file_name: string;
          p_page_count: number;
          p_sha256: string;
          p_storage_path: string;
          p_version_id: string;
        };
        Returns: SupabaseDatabase['public']['Tables']['documents']['Row'];
      };
      create_document_with_initial_version: {
        Args: {
          p_actor_id: string;
          p_article_reference: string | null;
          p_document_id: string;
          p_document_type: string;
          p_file_size_bytes: number;
          p_issuance_year: number | null;
          p_issuing_entity: string | null;
          p_metadata: Json;
          p_module_ids: string[];
          p_original_file_name: string;
          p_page_count: number;
          p_resolution_number: string | null;
          p_sha256: string;
          p_storage_path: string;
          p_title: string;
          p_version_id: string;
        };
        Returns: SupabaseDatabase['public']['Tables']['documents']['Row'];
      };
      link_document_module: {
        Args: {
          p_actor_id: string;
          p_document_id: string;
          p_module_id: string;
        };
        Returns: null;
      };
      logically_delete_document: {
        Args: { p_actor_id: string; p_document_id: string; p_reason: string };
        Returns: null;
      };
      record_document_download_url: {
        Args: {
          p_actor_id: string;
          p_document_id: string;
          p_document_version_id: string;
        };
        Returns: null;
      };
      set_document_publication_status: {
        Args: {
          p_actor_id: string;
          p_document_id: string;
          p_is_active: boolean;
          p_reason: string | null;
        };
        Returns: SupabaseDatabase['public']['Tables']['documents']['Row'];
      };
      unlink_document_module: {
        Args: {
          p_actor_id: string;
          p_document_id: string;
          p_module_id: string;
        };
        Returns: null;
      };
      update_document_metadata: {
        Args: { p_actor_id: string; p_document_id: string; p_patch: Json };
        Returns: SupabaseDatabase['public']['Tables']['documents']['Row'];
      };
    };
    Enums: {
      app_role: UserRole;
      document_audit_action:
        | 'activated'
        | 'created'
        | 'deactivated'
        | 'download_url_generated'
        | 'logically_deleted'
        | 'metadata_updated'
        | 'module_linked'
        | 'module_unlinked'
        | 'restored'
        | 'version_added';
      document_ingestion_status: 'pending';
      document_publication_status: 'active' | 'inactive';
    };
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
