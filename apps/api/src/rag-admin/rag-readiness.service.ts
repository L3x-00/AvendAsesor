import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { READINESS_AI_LIMITS } from '../config/ai-gateway';
import type { EmbeddingsGateway } from '../ingestion/embeddings.gateway';
import { EMBEDDINGS_GATEWAY } from '../ingestion/ingestion.tokens';
import { RAG_DEFAULT_MATCH_THRESHOLD } from '../rag/rag.constants';
import { RetrievalContractProbe } from '../rag/retrieval-contract.probe';
import {
  SUPABASE_HEALTH_GATEWAY,
  SUPABASE_RAG_READINESS_GATEWAY,
} from '../supabase/supabase.constants';
import type { SupabaseHealthGateway } from '../supabase/supabase-health.gateway';
import type {
  RagIngestionCounts,
  RagReadinessGateway,
} from '../supabase/supabase-rag-readiness.gateway';

export interface RagReadiness {
  /** `true` si el worker de ingesta está encendido (`RAG_INGESTION_WORKER_ENABLED`). */
  workerEnabled: boolean;
  /** Proveedor de IA efectivo según las claves configuradas. */
  provider: 'openrouter' | 'openai' | 'none';
  providerConfigured: boolean;
  embeddingModel: string;
  answerModel: string;
  matchThreshold: number;
  /** Conteo por estado de ingesta; `null` si Supabase no está configurado. */
  counts: RagIngestionCounts | null;
  /** Disponibilidad verificada de la base de datos usada por el RAG. */
  supabaseReady: boolean;
  /** La RPC vectorial se ejecutó con su firma actual. */
  retrievalContractReady: boolean;
  /** El proveedor devolvió un vector válido para una entrada mínima. */
  embeddingsReady: boolean;
  /** La ingesta puede procesar documentos; no condiciona consultas ya indexadas. */
  ingestionReady: boolean;
  /**
   * Señal única para el operador: el RAG puede responder una consulta contra
   * evidencia ya indexada. La capacidad de ingesta se informa por separado.
   */
  ready: boolean;
}

const READINESS_CACHE_MS = 15_000;
const EMBEDDING_PROBE_INPUT = 'avend readiness probe';

/**
 * Readiness del RAG para administradores (resuelve M8 del informe): expone si el
 * worker está encendido, si hay proveedor configurado, los modelos/umbral en uso,
 * cuántas versiones están indexadas/pendientes/fallidas y las dependencias que se
 * prueban en cada ciclo. Sin esto, un operador no distingue "apagado a propósito"
 * de "roto" ni un servicio encendido de uno capaz de recuperar evidencia.
 */
@Injectable()
export class RagReadinessService {
  private cached: { expiresAt: number; value: RagReadiness } | null = null;
  private inFlight: Promise<RagReadiness> | null = null;

  constructor(
    private readonly config: ConfigService,
    @Inject(SUPABASE_RAG_READINESS_GATEWAY)
    private readonly gateway: RagReadinessGateway,
    @Inject(SUPABASE_HEALTH_GATEWAY)
    private readonly supabaseHealthGateway: SupabaseHealthGateway,
    @Inject(EMBEDDINGS_GATEWAY)
    private readonly embeddings: EmbeddingsGateway,
    private readonly retrievalContractProbe: RetrievalContractProbe,
  ) {}

  async getReadiness(): Promise<RagReadiness> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) {
      return this.cached.value;
    }
    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.checkReadiness().then((value) => {
      this.cached = { expiresAt: Date.now() + READINESS_CACHE_MS, value };
      return value;
    });
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async checkReadiness(): Promise<RagReadiness> {
    const workerEnabled =
      this.config.get<boolean>('RAG_INGESTION_WORKER_ENABLED') ?? false;
    const hasOpenRouter = Boolean(
      this.config.get<string>('OPENROUTER_API_KEY'),
    );
    const hasOpenAi = Boolean(this.config.get<string>('OPENAI_API_KEY'));
    const provider = hasOpenRouter
      ? 'openrouter'
      : hasOpenAi
        ? 'openai'
        : 'none';
    const [supabaseResult, contractResult, embeddingsResult, countsResult] =
      await Promise.allSettled([
        this.supabaseHealthGateway.isReady(),
        this.retrievalContractProbe.check(),
        this.probeEmbeddings(),
        this.gateway.getIngestionCounts(),
      ]);
    const supabaseReady =
      supabaseResult.status === 'fulfilled' && supabaseResult.value;
    const retrievalContractReady =
      contractResult.status === 'fulfilled' && contractResult.value.ok;
    const embeddingsReady =
      embeddingsResult.status === 'fulfilled' && embeddingsResult.value;
    const counts =
      countsResult.status === 'fulfilled' ? countsResult.value : null;
    const ingestionReady = workerEnabled && supabaseReady && counts !== null;

    return {
      workerEnabled,
      provider,
      providerConfigured: provider !== 'none',
      embeddingModel:
        this.config.get<string>('RAG_EMBEDDING_MODEL') ??
        'text-embedding-3-small',
      answerModel: this.config.get<string>('RAG_ANSWER_MODEL') ?? 'gpt-4o-mini',
      matchThreshold:
        this.config.get<number>('RAG_MATCH_THRESHOLD') ??
        RAG_DEFAULT_MATCH_THRESHOLD,
      counts,
      supabaseReady,
      retrievalContractReady,
      embeddingsReady,
      ingestionReady,
      ready: supabaseReady && retrievalContractReady && embeddingsReady,
    };
  }

  private async probeEmbeddings(): Promise<boolean> {
    try {
      const vectors = await this.embeddings.embed(
        [EMBEDDING_PROBE_INPUT],
        READINESS_AI_LIMITS,
        AbortSignal.timeout(READINESS_AI_LIMITS.timeout),
      );
      return vectors.length === 1 && vectors[0].length > 0;
    } catch {
      return false;
    }
  }
}
