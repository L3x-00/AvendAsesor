import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseOperationsGatewayAdapter } from './supabase-operations.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

function clientWith(rpc: jest.Mock): SupabaseServerClient {
  return { rpc } as unknown as SupabaseServerClient;
}

describe('SupabaseOperationsGatewayAdapter', () => {
  it('maps aggregate metrics, the minimized unanswered queue and a review command', async () => {
    const rpc = jest
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            active_documents: 2,
            active_modules: 3,
            dismissed_unanswered_questions: 4,
            pending_ingestion_jobs: 5,
            pending_unanswered_questions: 6,
            provider_cost_status: 'not_configured',
            resolved_unanswered_questions: 7,
            total_conversations: 8,
            total_users: 9,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            category: null,
            conversation_id: null,
            created_at: '2026-08-23T00:00:00.000Z',
            id: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
            message_id: null,
            question: '¿Qué documento corresponde?',
            reason: 'insufficient_evidence',
            reviewed_at: null,
            reviewed_by: null,
            review_note: null,
            selected_module_id: null,
            status: 'pending_review',
            top_relevance_score: null,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    const gateway = new SupabaseOperationsGatewayAdapter(clientWith(rpc));
    const reviewerId = '80a15a92-9899-4ee2-81e0-30d7c3f7677c';

    await expect(gateway.getMetrics({ reviewerId })).resolves.toEqual({
      activeDocuments: 2,
      activeModules: 3,
      dismissedUnansweredQuestions: 4,
      pendingIngestionJobs: 5,
      pendingUnansweredQuestions: 6,
      providerCostStatus: 'not_configured',
      resolvedUnansweredQuestions: 7,
      totalConversations: 8,
      totalUsers: 9,
    });
    await expect(
      gateway.listUnansweredQuestions({
        limit: 10,
        reviewerId,
        status: 'pending_review',
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        question: '¿Qué documento corresponde?',
        status: 'pending_review',
      }),
    ]);
    await expect(
      gateway.reviewUnansweredQuestion({
        category: 'documentation_gap',
        decision: 'resolved',
        questionId: '70a15a92-9899-4ee2-81e0-30d7c3f7677c',
        reviewNote: 'Cargar la norma oficial vigente.',
        reviewerId,
      }),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['42501', ForbiddenException],
    ['P0002', NotFoundException],
    ['22023', BadRequestException],
    ['23514', ConflictException],
    ['P0001', ConflictException],
    ['XX000', ServiceUnavailableException],
  ])(
    'maps database error %s without exposing provider details',
    async (code, Exception) => {
      const gateway = new SupabaseOperationsGatewayAdapter(
        clientWith(
          jest.fn().mockResolvedValue({ data: null, error: { code } }),
        ),
      );

      await expect(
        gateway.getMetrics({
          reviewerId: '80a15a92-9899-4ee2-81e0-30d7c3f7677c',
        }),
      ).rejects.toBeInstanceOf(Exception);
    },
  );

  it('fails closed for missing metric rows and unconfigured dependencies', async () => {
    const missingResult = new SupabaseOperationsGatewayAdapter(
      clientWith(jest.fn().mockResolvedValue({ data: [], error: null })),
    );
    const unavailable = new SupabaseOperationsGatewayAdapter(null);

    await expect(
      missingResult.getMetrics({
        reviewerId: '80a15a92-9899-4ee2-81e0-30d7c3f7677c',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      unavailable.listUnansweredQuestions({
        limit: 10,
        reviewerId: '80a15a92-9899-4ee2-81e0-30d7c3f7677c',
        status: 'pending_review',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
