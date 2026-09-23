import { RETRIEVAL_RPC_NAME } from '../rag/retrieval.constants';
import type { SupabaseServerClient } from './supabase.server-client';

export type RetrievalContractStatus =
  | { ok: true }
  | {
      ok: false;
      reason: 'unconfigured' | 'missing' | 'error';
      message: string;
    };

export interface RetrievalContractGateway {
  /**
   * Prueba benigna de que la RPC de retrieval existe y es invocable con la firma
   * esperada. No devuelve filas (umbral imposible); distingue "función
   * ausente/renombrada" (`missing`) de un error transitorio (`error`).
   */
  probe(): Promise<RetrievalContractStatus>;
}

interface ProbeError {
  code?: string;
  message?: string;
}

interface ProbeableClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): {
    abortSignal(signal: AbortSignal): PromiseLike<{ error: unknown }>;
  };
}

/** Códigos que indican que la función no existe (PostgREST / PostgreSQL). */
const MISSING_CODES = new Set(['PGRST202', '42883']);
const MISSING_MESSAGE =
  /could not find the function|does not exist|schema cache/i;

export class SupabaseRetrievalContractGatewayAdapter implements RetrievalContractGateway {
  constructor(private readonly client: SupabaseServerClient | null) {}

  async probe(): Promise<RetrievalContractStatus> {
    const client = this.client;
    if (!client) {
      return {
        ok: false,
        reason: 'unconfigured',
        message: 'Supabase no está configurado.',
      };
    }

    // Vector unitario (no nulo, para no indefinir la distancia coseno) + umbral
    // imposible: la RPC no devuelve filas, solo confirma que existe y es invocable.
    const embedding = new Array<number>(1536).fill(0);
    embedding[0] = 1;

    try {
      const { error } = await (client as unknown as ProbeableClient)
        .rpc(RETRIEVAL_RPC_NAME, {
          p_query_embedding: embedding,
          p_query_text: '',
          p_selected_module_id: null,
          p_match_threshold: 2,
          p_match_count: 1,
          p_retrieval_scope: 'current',
        })
        .abortSignal(AbortSignal.timeout(5_000));

      if (!error) {
        return { ok: true };
      }
      const probeError = error as ProbeError;
      const missing =
        (probeError.code !== undefined && MISSING_CODES.has(probeError.code)) ||
        MISSING_MESSAGE.test(probeError.message ?? '');
      return {
        ok: false,
        reason: missing ? 'missing' : 'error',
        message: probeError.message ?? 'error de retrieval',
      };
    } catch (error) {
      return {
        ok: false,
        reason: 'error',
        message: error instanceof Error ? error.message : 'error inesperado',
      };
    }
  }
}
