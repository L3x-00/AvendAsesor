import type { PostgrestError } from '@supabase/supabase-js';
import { ServiceUnavailableException } from '@nestjs/common';
import type {
  ResolvedConsultation,
  TeacherUpdatesGateway,
} from '../chat/teacher-updates.types';
import type { SupabaseServerClient } from './supabase.server-client';

const MAX_UPDATES = 20;

/** Consulta mínima sin tipos generados (tablas de Consultas y reportes). */
interface UntypedQuery extends PromiseLike<{
  data: Record<string, unknown>[] | null;
  error: PostgrestError | null;
}> {
  eq(column: string, value: unknown): UntypedQuery;
  gte(column: string, value: string): UntypedQuery;
  in(column: string, values: readonly unknown[]): UntypedQuery;
  limit(count: number): UntypedQuery;
  not(column: string, operator: string, value: unknown): UntypedQuery;
  order(column: string, options: { ascending: boolean }): UntypedQuery;
}

interface UntypedClient {
  from(table: string): { select(columns: string): UntypedQuery };
}

function databaseError(error: PostgrestError): never {
  throw new ServiceUnavailableException({
    code: 'TEACHER_UPDATES_UNAVAILABLE',
    message: error.message,
  });
}

/**
 * Consultas del propio docente que la administración marcó como resueltas
 * (por ejemplo, tras cargar el documento que faltaba). Siempre filtra por el
 * usuario autenticado y por conversaciones que no eliminó.
 */
export class SupabaseTeacherUpdatesGatewayAdapter implements TeacherUpdatesGateway {
  constructor(private readonly client: SupabaseServerClient | null) {}

  async listResolvedConsultations(input: {
    since: string;
    userId: string;
  }): Promise<ResolvedConsultation[]> {
    if (!this.client) {
      throw new ServiceUnavailableException({
        code: 'SUPABASE_NOT_CONFIGURED',
        message: 'Supabase no está configurado.',
      });
    }
    const client = this.client as unknown as UntypedClient;

    const cases = await client
      .from('consultation_cases')
      .select('conversation_id, question_snapshot, updated_at')
      .eq('user_id', input.userId)
      .eq('status', 'resolved')
      .eq('kind', 'automatic_alert')
      .eq('issue_type', 'support_insufficient')
      .not('conversation_id', 'is', null)
      .gte('updated_at', input.since)
      .order('updated_at', { ascending: false })
      .limit(MAX_UPDATES * 3);
    if (cases.error) databaseError(cases.error);

    const latestByConversation = new Map<string, ResolvedConsultation>();
    for (const row of cases.data ?? []) {
      const conversationId = row.conversation_id;
      const resolvedAt = row.updated_at;
      if (
        typeof conversationId !== 'string' ||
        typeof resolvedAt !== 'string'
      ) {
        continue;
      }
      if (latestByConversation.has(conversationId)) continue;
      latestByConversation.set(conversationId, {
        conversationId,
        question:
          typeof row.question_snapshot === 'string'
            ? row.question_snapshot
            : null,
        resolvedAt,
      });
    }
    if (!latestByConversation.size) return [];

    const conversations = await client
      .from('chat_conversations')
      .select('id')
      .in('id', [...latestByConversation.keys()])
      .eq('user_id', input.userId)
      .eq('is_deleted', false);
    if (conversations.error) databaseError(conversations.error);
    const visible = new Set(
      (conversations.data ?? []).map((row) => row.id as string),
    );

    return [...latestByConversation.values()]
      .filter((update) => visible.has(update.conversationId))
      .slice(0, MAX_UPDATES);
  }
}
