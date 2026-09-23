import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SUPABASE_RAG_READINESS_GATEWAY } from '../supabase/supabase.constants';
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
  /**
   * Señal única para el operador: el RAG puede indexar y responder de verdad
   * (worker on + proveedor configurado + almacén alcanzable). Distingue
   * "apagado a propósito" de "roto".
   */
  ready: boolean;
}

/**
 * Readiness del RAG para administradores (resuelve M8 del informe): expone si el
 * worker está encendido, si hay proveedor configurado, los modelos/umbral en uso
 * y cuántas versiones están indexadas/pendientes/fallidas. Sin esto, un operador
 * no distingue "apagado a propósito" de "roto".
 */
@Injectable()
export class RagReadinessService {
  constructor(
    private readonly config: ConfigService,
    @Inject(SUPABASE_RAG_READINESS_GATEWAY)
    private readonly gateway: RagReadinessGateway,
  ) {}

  async getReadiness(): Promise<RagReadiness> {
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
    const counts = await this.gateway.getIngestionCounts();

    return {
      workerEnabled,
      provider,
      providerConfigured: provider !== 'none',
      embeddingModel:
        this.config.get<string>('RAG_EMBEDDING_MODEL') ??
        'text-embedding-3-small',
      answerModel: this.config.get<string>('RAG_ANSWER_MODEL') ?? 'gpt-4o-mini',
      matchThreshold: this.config.get<number>('RAG_MATCH_THRESHOLD') ?? 0.7,
      counts,
      ready: workerEnabled && provider !== 'none' && counts !== null,
    };
  }
}
