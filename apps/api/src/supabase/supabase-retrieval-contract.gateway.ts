import {
  EXACT_REFERENCE_RETRIEVAL_RPC_NAME,
  RETRIEVAL_RPC_NAME,
} from '../rag/retrieval.constants';
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

    // Argumentos VÁLIDOS pero inocuos: la RPC valida su entrada (texto 1..8000,
    // umbral en [0,1]) y lanza 22023 si no se cumplen, así que el probe debe
    // pasar esa guarda. Vector unitario (no nulo, para no indefinir el coseno),
    // texto mínimo no vacío y umbral 1: la RPC ejecuta y no devuelve filas (nada
    // puntúa >= 1 contra este vector), confirmando solo que existe y es invocable.
    const embedding = new Array<number>(1536).fill(0);
    embedding[0] = 1;

    try {
      const contracts = [
        {
          args: {
            p_match_count: 1,
            p_match_threshold: 1,
            p_query_embedding: embedding,
            p_query_text: 'probe',
            p_retrieval_scope: 'current',
            p_selected_module_id: null,
          },
          name: RETRIEVAL_RPC_NAME,
        },
        {
          args: {
            p_match_count: 1,
            p_query_embedding: embedding,
            p_query_text: 'probe',
            p_reference_keys: ['LEY:99999999'],
            p_retrieval_scope: 'current',
          },
          name: EXACT_REFERENCE_RETRIEVAL_RPC_NAME,
        },
      ] as const;

      for (const contract of contracts) {
        const { error } = await (client as unknown as ProbeableClient)
          .rpc(contract.name, contract.args)
          .abortSignal(AbortSignal.timeout(5_000));
        if (!error) continue;

        const probeError = error as ProbeError;
        const missing =
          (probeError.code !== undefined &&
            MISSING_CODES.has(probeError.code)) ||
          MISSING_MESSAGE.test(probeError.message ?? '');
        return {
          ok: false,
          reason: missing ? 'missing' : 'error',
          message: `${contract.name}: ${probeError.message ?? 'error de retrieval'}`,
        };
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: 'error',
        message: error instanceof Error ? error.message : 'error inesperado',
      };
    }
  }
}
