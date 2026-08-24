import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseFaqMemoryGatewayAdapter } from './supabase-faq-memory.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

function postgrestError(code: string) {
  return { code, details: '', hint: '', message: 'database error' };
}

function createClient(result: { data?: unknown; error?: unknown } = {}): {
  client: SupabaseServerClient;
  rpc: jest.Mock;
} {
  const rpc = jest.fn().mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  });
  return { client: { rpc } as unknown as SupabaseServerClient, rpc };
}

describe('SupabaseFaqMemoryGatewayAdapter', () => {
  const reviewerId = '4c8b56af-6d0c-4fef-881e-7c00907540dd';

  it('uses only controlled RPCs and maps database values to the application shape', async () => {
    const { client, rpc } = createClient({
      data: [
        {
          ambiguous_count: 1,
          evidence_count: 3,
          first_seen_at: '2026-08-23T00:00:00.000Z',
          id: '5c8b56af-6d0c-4fef-881e-7c00907540dd',
          last_seen_at: '2026-08-23T00:00:00.000Z',
          no_evidence_count: 2,
          occurrence_count: 6,
          reviewed_at: null,
          reviewed_by: null,
          review_label: null,
          selected_module_id: null,
          status: 'pending_review',
        },
      ],
    });
    const gateway = new SupabaseFaqMemoryGatewayAdapter(client);

    await expect(
      gateway.listCandidates({
        limit: 20,
        reviewerId,
        status: 'pending_review',
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        occurrenceCount: 6,
        reviewLabel: null,
      }),
    ]);

    expect(rpc).toHaveBeenCalledWith('list_faq_memory_candidates_v2', {
      p_limit: 20,
      p_reviewer_id: reviewerId,
      p_status: 'pending_review',
    });
  });

  it('fails closed when the server client is missing or the database denies review access', async () => {
    const unavailable = new SupabaseFaqMemoryGatewayAdapter(null);
    await expect(
      unavailable.getQualitySummary({ reviewerId }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const { client } = createClient({ error: postgrestError('42501') });
    const denied = new SupabaseFaqMemoryGatewayAdapter(client);
    await expect(
      denied.reviewCandidate({
        candidateId: '5c8b56af-6d0c-4fef-881e-7c00907540dd',
        decision: 'approved',
        reviewNote: null,
        reviewLabel: 'Solicitud de licencia docente',
        reviewerId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
