import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AccountStatus, UserRole } from '../users/domain/user-profile';

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
          account_status: AccountStatus;
          created_at: string;
          full_name: string;
          id: string;
          last_access_at: string | null;
          role: UserRole;
          status_changed_at: string | null;
          status_changed_by: string | null;
          status_reason: string | null;
          updated_at: string;
        };
        Insert: {
          account_status?: AccountStatus;
          created_at?: string;
          full_name: string;
          id: string;
          last_access_at?: string | null;
          role?: UserRole;
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          status_reason?: string | null;
          updated_at?: string;
        };
        Update: {
          account_status?: AccountStatus;
          created_at?: string;
          full_name?: string;
          id?: string;
          last_access_at?: string | null;
          role?: UserRole;
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          status_reason?: string | null;
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
          replacement_date: string | null;
          replacement_document_id: string | null;
          replacement_observation: string | null;
          replacement_reason: string | null;
          replacement_year: number | null;
          resolution_number: string | null;
          search_vector: string;
          situation: 'archived' | 'current' | 'replaced';
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
          ingestion_status: 'failed' | 'indexed' | 'pending' | 'processing';
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
      document_ingestion_jobs: {
        Row: {
          attempt_count: number;
          document_id: string;
          document_version_id: string;
          id: string;
          last_error_code: string | null;
          last_error_message: string | null;
          lease_expires_at: string | null;
          lease_token: string | null;
          leased_at: string | null;
          max_attempts: number;
          status: 'completed' | 'failed' | 'pending' | 'processing';
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      document_chunks: {
        Row: {
          article_reference: string | null;
          chunk_content: string;
          chunk_index: number;
          document_id: string;
          document_version_id: string;
          embedding: string;
          id: string;
          numeral_reference: string | null;
          page_end: number;
          page_start: number;
          section_title: string | null;
          token_count: number;
        };
        Insert: {
          article_reference?: string | null;
          chunk_content: string;
          chunk_index: number;
          document_id: string;
          document_version_id: string;
          embedding: number[];
          id?: string;
          numeral_reference?: string | null;
          page_end: number;
          page_start: number;
          section_title?: string | null;
          token_count: number;
        };
        Update: never;
        Relationships: [];
      };
      chat_source_access_events: {
        Row: {
          id: string;
          occurred_at: string;
          source_id: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          occurred_at?: string;
          source_id: string;
          user_id: string;
        };
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
      list_document_library: {
        Args: {
          p_document_type: string | null;
          p_issuance_year: number | null;
          p_issuing_entity: string | null;
          p_limit: number;
          p_module_id: string | null;
          p_offset: number;
          p_query: string | null;
          p_situation: 'archived' | 'current' | 'replaced' | null;
          p_sort: 'newest' | 'oldest' | 'title' | 'upload_date' | 'year';
          p_submodule_id: string | null;
          p_technical_status: 'error' | 'pending_approval' | 'ready' | null;
        };
        Returns: {
          article_reference: string | null;
          created_at: string;
          created_by: string | null;
          created_by_name: string | null;
          current_version_id: string | null;
          current_version_ingestion_status:
            'failed' | 'indexed' | 'pending' | 'processing' | null;
          current_version_uploaded_at: string | null;
          document_type: string;
          id: string;
          issuance_year: number | null;
          issuing_entity: string | null;
          metadata: Json;
          module_associations: Json;
          publication_status: 'active' | 'inactive';
          replacement_date: string | null;
          replacement_document_id: string | null;
          replacement_observation: string | null;
          replacement_reason: string | null;
          replacement_year: number | null;
          resolution_number: string | null;
          situation: 'archived' | 'current' | 'replaced';
          title: string;
          total_count: number;
          updated_at: string;
          updated_by: string | null;
        }[];
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
      set_document_situation: {
        Args: {
          p_actor_id: string;
          p_document_id: string;
          p_observation: string | null;
          p_reason: string | null;
          p_replacement_date: string | null;
          p_replacement_document_id: string | null;
          p_replacement_year: number | null;
          p_situation: 'archived' | 'current' | 'replaced';
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
      claim_document_ingestion_job: {
        Args: { p_lease_seconds?: number };
        Returns: {
          attempt_count: number;
          document_id: string;
          document_version_id: string;
          job_id: string;
          lease_token: string;
          page_count: number;
          sha256: string;
          storage_bucket: string;
          storage_path: string;
        }[];
      };
      clear_document_ingestion_chunks: {
        Args: { p_job_id: string; p_lease_token: string };
        Returns: null;
      };
      complete_document_ingestion_job: {
        Args: { p_job_id: string; p_lease_token: string };
        Returns: null;
      };
      fail_document_ingestion_job: {
        Args: {
          p_error_code: string;
          p_error_message: string;
          p_job_id: string;
          p_lease_token: string;
          p_retryable: boolean;
        };
        Returns: null;
      };
      refresh_document_ingestion_job_lease: {
        Args: {
          p_job_id: string;
          p_lease_seconds?: number;
          p_lease_token: string;
        };
        Returns: null;
      };
      begin_chat_turn: {
        Args: {
          p_conversation_id?: string | null;
          p_question?: string | null;
          p_selected_module_id?: string | null;
          p_user_id: string;
        };
        Returns: {
          conversation_id: string;
          user_message_id: string;
        }[];
      };
      complete_chat_turn: {
        Args: {
          p_answer: string;
          p_answer_role: 'assistant' | 'clarification' | 'no_evidence';
          p_conversation_id: string;
          p_sources?: Json;
          p_top_relevance_score?: number | null;
          p_unanswered_reason?:
            'ambiguous_request' | 'insufficient_evidence' | null;
          p_user_id: string;
          p_user_message_id: string;
        };
        Returns: { answer_message_id: string }[];
      };
      complete_chat_turn_with_learning: {
        Args: {
          p_answer: string;
          p_answer_role: 'assistant' | 'clarification' | 'no_evidence';
          p_conversation_id: string;
          p_faq_canonical_question?: string | null;
          p_faq_question_fingerprint?: string | null;
          p_sources?: Json;
          p_top_relevance_score?: number | null;
          p_unanswered_reason?:
            'ambiguous_request' | 'insufficient_evidence' | null;
          p_user_id: string;
          p_user_message_id: string;
        };
        Returns: { answer_message_id: string }[];
      };
      complete_chat_turn_with_learning_v2: {
        Args: {
          p_answer: string;
          p_answer_role: 'assistant' | 'clarification' | 'no_evidence';
          p_conversation_id: string;
          p_faq_question_fingerprint?: string | null;
          p_sources?: Json;
          p_top_relevance_score?: number | null;
          p_unanswered_reason?:
            'ambiguous_request' | 'insufficient_evidence' | null;
          p_user_id: string;
          p_user_message_id: string;
        };
        Returns: { answer_message_id: string }[];
      };
      get_faq_memory_quality_summary: {
        Args: { p_reviewer_id: string };
        Returns: {
          ambiguous_observations: number;
          approved_candidates: number;
          evidence_observations: number;
          no_evidence_observations: number;
          pending_review_candidates: number;
          rejected_candidates: number;
          suppressed_candidates: number;
          total_candidates: number;
          total_observations: number;
        }[];
      };
      get_hito4_operational_metrics: {
        Args: { p_reviewer_id: string };
        Returns: {
          active_documents: number;
          active_modules: number;
          dismissed_unanswered_questions: number;
          pending_ingestion_jobs: number;
          pending_unanswered_questions: number;
          provider_cost_status: 'not_configured';
          resolved_unanswered_questions: number;
          total_conversations: number;
          total_users: number;
        }[];
      };
      get_chat_conversation: {
        Args: {
          p_conversation_id: string;
          p_limit?: number;
          p_user_id: string;
        };
        Returns: Json;
      };
      get_chat_conversation_context: {
        Args: {
          p_character_limit?: number;
          p_conversation_id: string;
          p_message_limit?: number;
          p_user_id: string;
        };
        Returns: Json;
      };
      authorize_chat_source_download: {
        Args: { p_source_id: string; p_user_id: string };
        Returns: {
          source_id: string;
          storage_bucket: string;
          storage_path: string;
        }[];
      };
      delete_chat_conversation: {
        Args: { p_conversation_id: string; p_user_id: string };
        Returns: { deleted_at: string; id: string }[];
      };
      list_chat_conversations: {
        Args: { p_limit?: number; p_user_id: string };
        Returns: {
          created_at: string;
          id: string;
          selected_module_id: string | null;
          title: string | null;
          updated_at: string;
        }[];
      };
      list_chat_conversations_page: {
        Args: {
          p_cursor_id?: string | null;
          p_cursor_updated_at?: string | null;
          p_limit?: number;
          p_user_id: string;
        };
        Returns: {
          created_at: string;
          id: string;
          selected_module_id: string | null;
          title: string | null;
          updated_at: string;
        }[];
      };
      list_faq_memory_candidates: {
        Args: {
          p_limit?: number;
          p_reviewer_id: string;
          p_status?: 'pending_review' | 'approved' | 'rejected' | 'suppressed';
        };
        Returns: {
          ambiguous_count: number;
          canonical_question: string;
          evidence_count: number;
          first_seen_at: string;
          id: string;
          last_seen_at: string;
          no_evidence_count: number;
          occurrence_count: number;
          reviewed_at: string | null;
          reviewed_by: string | null;
          selected_module_id: string | null;
          status: 'pending_review' | 'approved' | 'rejected' | 'suppressed';
        }[];
      };
      list_faq_memory_candidates_v2: {
        Args: {
          p_limit?: number;
          p_reviewer_id: string;
          p_status?: 'pending_review' | 'approved' | 'rejected' | 'suppressed';
        };
        Returns: {
          ambiguous_count: number;
          evidence_count: number;
          first_seen_at: string;
          id: string;
          last_seen_at: string;
          no_evidence_count: number;
          occurrence_count: number;
          review_label: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          selected_module_id: string | null;
          status: 'pending_review' | 'approved' | 'rejected' | 'suppressed';
        }[];
      };
      list_unanswered_questions: {
        Args: {
          p_limit?: number;
          p_reviewer_id: string;
          p_status?: 'pending_review' | 'resolved' | 'dismissed';
        };
        Returns: {
          category:
            | 'documentation_gap'
            | 'module_configuration'
            | 'outside_scope'
            | 'duplicate'
            | 'other'
            | null;
          conversation_id: string | null;
          created_at: string;
          id: string;
          message_id: string | null;
          question: string;
          reason: 'ambiguous_request' | 'insufficient_evidence';
          reviewed_at: string | null;
          reviewed_by: string | null;
          review_note: string | null;
          selected_module_id: string | null;
          status: 'pending_review' | 'resolved' | 'dismissed';
          top_relevance_score: number | null;
        }[];
      };
      list_administrative_users: {
        Args: {
          p_actor_id: string;
          p_limit?: number;
          p_search?: string | null;
        };
        Returns: {
          account_status: AccountStatus;
          created_at: string;
          full_name: string;
          id: string;
          last_access_at: string | null;
          role: UserRole;
        }[];
      };
      update_administrative_user: {
        Args: {
          p_account_status?: AccountStatus | null;
          p_actor_id: string;
          p_reason?: string | null;
          p_role?: UserRole | null;
          p_target_user_id: string;
        };
        Returns: {
          account_status: AccountStatus;
          full_name: string;
          id: string;
          last_access_at: string | null;
          role: UserRole;
        }[];
      };
      list_operational_audit_events: {
        Args: { p_actor_id: string; p_limit?: number };
        Returns: {
          action:
            | 'chat_history_deleted'
            | 'unanswered_question_reviewed'
            | 'user_role_changed'
            | 'user_status_changed';
          actor_id: string;
          actor_role: UserRole;
          id: string;
          metadata: Json;
          occurred_at: string;
          resource_id: string;
          resource_type:
            'chat_conversation' | 'unanswered_question' | 'profile';
        }[];
      };
      touch_profile_last_access: {
        Args: { p_user_id: string };
        Returns: null;
      };
      review_faq_memory_candidate: {
        Args: {
          p_candidate_id: string;
          p_decision: 'approved' | 'rejected' | 'suppressed';
          p_review_note?: string | null;
          p_reviewer_id: string;
        };
        Returns: null;
      };
      review_faq_memory_candidate_v2: {
        Args: {
          p_candidate_id: string;
          p_decision: 'approved' | 'rejected' | 'suppressed';
          p_review_label?: string | null;
          p_review_note?: string | null;
          p_reviewer_id: string;
        };
        Returns: null;
      };
      review_unanswered_question: {
        Args: {
          p_category:
            | 'documentation_gap'
            | 'module_configuration'
            | 'outside_scope'
            | 'duplicate'
            | 'other';
          p_decision: 'resolved' | 'dismissed';
          p_review_note: string;
          p_reviewer_id: string;
          p_unanswered_question_id: string;
        };
        Returns: null;
      };
      search_document_chunks: {
        Args: {
          p_match_count?: number;
          p_match_threshold?: number;
          p_query_embedding: number[];
          p_query_text: string;
          p_selected_module_id?: string | null;
        };
        Returns: {
          article_reference: string | null;
          chunk_content: string;
          chunk_id: string;
          document_id: string;
          document_title: string;
          document_version_id: string;
          lexical_score: number;
          module_ids: string[];
          module_names: string[];
          numeral_reference: string | null;
          page_end: number;
          page_start: number;
          section_title: string | null;
          semantic_score: number;
          version_number: number;
        }[];
      };
    };
    Enums: {
      app_role: UserRole;
      account_status: AccountStatus;
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
      document_ingestion_status:
        'failed' | 'indexed' | 'pending' | 'processing';
      document_publication_status: 'active' | 'inactive';
      document_situation: 'archived' | 'current' | 'replaced';
      chat_message_role: 'assistant' | 'clarification' | 'no_evidence' | 'user';
      unanswered_question_reason: 'ambiguous_request' | 'insufficient_evidence';
      unanswered_question_status: 'pending_review' | 'resolved' | 'dismissed';
      unanswered_question_category:
        | 'documentation_gap'
        | 'module_configuration'
        | 'outside_scope'
        | 'duplicate'
        | 'other';
      faq_memory_outcome: 'evidence' | 'ambiguous' | 'no_evidence';
      faq_memory_review_status:
        'pending_review' | 'approved' | 'rejected' | 'suppressed';
      operational_audit_action:
        | 'chat_history_deleted'
        | 'unanswered_question_reviewed'
        | 'user_role_changed'
        | 'user_status_changed';
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
