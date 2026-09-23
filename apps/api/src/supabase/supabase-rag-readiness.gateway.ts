import { ServiceUnavailableException } from '@nestjs/common';
import type { SupabaseServerClient } from './supabase.server-client';

/** Conteo de versiones de documento por estado de ingesta RAG. */
export interface RagIngestionCounts {
  pending: number;
  processing: number;
  indexed: number;
  failed: number;
  total: number;
}

export interface RagReadinessGateway {
  /**
   * Conteo de versiones por `ingestion_status`. Devuelve `null` cuando el cliente
   * de Supabase no está configurado (sin URL/clave), para que el endpoint pueda
   * distinguir "no configurado" de "0 documentos".
   */
  getIngestionCounts(): Promise<RagIngestionCounts | null>;
}

/** Estados de ingesta de `document_versions` (enum del esquema). */
const INGESTION_STATUSES = [
  'pending',
  'processing',
  'indexed',
  'failed',
] as const;

export class SupabaseRagReadinessGatewayAdapter implements RagReadinessGateway {
  constructor(private readonly client: SupabaseServerClient | null) {}

  async getIngestionCounts(): Promise<RagIngestionCounts | null> {
    const client = this.client;
    if (!client) {
      return null;
    }

    // Un conteo `head` por estado: no trae filas, solo el total por estado.
    const entries = await Promise.all(
      INGESTION_STATUSES.map(async (status) => {
        const { count, error } = await client
          .from('document_versions')
          .select('id', { count: 'exact', head: true })
          .eq('ingestion_status', status);
        if (error) {
          throw new ServiceUnavailableException(
            'The RAG readiness store is temporarily unavailable.',
          );
        }
        return [status, count ?? 0] as const;
      }),
    );

    const byStatus = Object.fromEntries(entries) as Record<
      (typeof INGESTION_STATUSES)[number],
      number
    >;

    return {
      pending: byStatus.pending,
      processing: byStatus.processing,
      indexed: byStatus.indexed,
      failed: byStatus.failed,
      total:
        byStatus.pending +
        byStatus.processing +
        byStatus.indexed +
        byStatus.failed,
    };
  }
}
