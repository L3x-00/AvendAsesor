import { ServiceUnavailableException } from '@nestjs/common';
import { SupabaseTeacherUpdatesGatewayAdapter } from './supabase-teacher-updates.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

type Rows = Record<string, unknown>[];

/** Cliente mínimo: registra los filtros y responde las filas de cada tabla. */
function fakeClient(tables: Record<string, Rows>, failing?: string) {
  const calls: Array<[string, string, unknown]> = [];
  const client = {
    from(table: string) {
      const result =
        failing === table
          ? { data: null, error: { message: 'down' } }
          : { data: tables[table] ?? [], error: null };
      const chain: Record<string, unknown> = {};
      for (const method of [
        'select',
        'eq',
        'gte',
        'in',
        'limit',
        'not',
        'order',
      ]) {
        chain[method] = (...args: unknown[]) => {
          calls.push([table, method, args[0]]);
          return chain;
        };
      }
      chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
      return chain;
    },
  } as unknown as SupabaseServerClient;
  return { calls, client };
}

const input = { since: '2026-09-01T00:00:00.000Z', userId: 'user-1' };

describe('SupabaseTeacherUpdatesGatewayAdapter', () => {
  it('devuelve la resolución más reciente por conversación visible del propio usuario', async () => {
    const { calls, client } = fakeClient({
      chat_conversations: [{ id: 'c1' }, { id: 'c2' }],
      consultation_cases: [
        {
          conversation_id: 'c1',
          question_snapshot: '¿Qué dice la escala?',
          updated_at: '2026-09-26T10:00:00.000Z',
        },
        {
          conversation_id: 'c1',
          question_snapshot: 'repetida',
          updated_at: '2026-09-20T10:00:00.000Z',
        },
        {
          conversation_id: 'c2',
          question_snapshot: null,
          updated_at: '2026-09-25T10:00:00.000Z',
        },
        {
          // Conversación eliminada: no aparece.
          conversation_id: 'c3',
          question_snapshot: 'eliminada',
          updated_at: '2026-09-24T10:00:00.000Z',
        },
        { conversation_id: null, updated_at: '2026-09-24T10:00:00.000Z' },
      ],
    });

    await expect(
      new SupabaseTeacherUpdatesGatewayAdapter(
        client,
      ).listResolvedConsultations(input),
    ).resolves.toEqual([
      {
        conversationId: 'c1',
        question: '¿Qué dice la escala?',
        resolvedAt: '2026-09-26T10:00:00.000Z',
      },
      {
        conversationId: 'c2',
        question: null,
        resolvedAt: '2026-09-25T10:00:00.000Z',
      },
    ]);
    // Siempre acotado al usuario autenticado.
    expect(calls).toContainEqual(['consultation_cases', 'eq', 'user_id']);
    expect(calls).toContainEqual(['consultation_cases', 'eq', 'issue_type']);
    expect(calls).toContainEqual(['chat_conversations', 'eq', 'user_id']);
    expect(calls).toContainEqual(['chat_conversations', 'eq', 'is_deleted']);
  });

  it('sin casos resueltos no consulta las conversaciones', async () => {
    const { calls, client } = fakeClient({ consultation_cases: [] });

    await expect(
      new SupabaseTeacherUpdatesGatewayAdapter(
        client,
      ).listResolvedConsultations(input),
    ).resolves.toEqual([]);
    expect(calls.some(([table]) => table === 'chat_conversations')).toBe(false);
  });

  it('informa de forma controlada si la base falla o no está configurada', async () => {
    await expect(
      new SupabaseTeacherUpdatesGatewayAdapter(
        fakeClient({}, 'consultation_cases').client,
      ).listResolvedConsultations(input),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      new SupabaseTeacherUpdatesGatewayAdapter(
        fakeClient(
          {
            consultation_cases: [
              { conversation_id: 'c1', updated_at: '2026-09-26T10:00:00.000Z' },
            ],
          },
          'chat_conversations',
        ).client,
      ).listResolvedConsultations(input),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      new SupabaseTeacherUpdatesGatewayAdapter(null).listResolvedConsultations(
        input,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
