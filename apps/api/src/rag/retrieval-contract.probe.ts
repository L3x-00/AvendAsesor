import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { SUPABASE_RETRIEVAL_CONTRACT_GATEWAY } from '../supabase/supabase.constants';
import type { RetrievalContractGateway } from '../supabase/supabase-retrieval-contract.gateway';
import { RETRIEVAL_RPC_NAME } from './retrieval.constants';

/**
 * Fail-fast de arranque (M7): al bootear, verifica que la RPC de retrieval del
 * chat exista y sea invocable. Si falta o cambió de firma (desajuste
 * migración/código, p. ej. código desplegado sin aplicar la migración), lo
 * registra como ERROR claro y accionable, en vez de dejar que se manifieste como
 * un `503` silencioso cuando un usuario consulta. No aborta el arranque: un fallo
 * transitorio del almacén no debe impedir levantar la API.
 */
@Injectable()
export class RetrievalContractProbe implements OnApplicationBootstrap {
  private readonly logger = new Logger(RetrievalContractProbe.name);

  constructor(
    @Inject(SUPABASE_RETRIEVAL_CONTRACT_GATEWAY)
    private readonly gateway: RetrievalContractGateway,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const status = await this.gateway.probe();

    if (status.ok) {
      this.logger.log(`Retrieval RPC contract OK (${RETRIEVAL_RPC_NAME}).`);
      return;
    }

    if (status.reason === 'missing') {
      this.logger.error(
        `RAG retrieval RPC "${RETRIEVAL_RPC_NAME}" is missing or its signature ` +
          `changed (migration/code mismatch). Chat queries will fail with 503 ` +
          `until the migration that defines it is applied. Detail: ${status.message}`,
      );
      return;
    }

    if (status.reason === 'unconfigured') {
      this.logger.warn(
        'Skipped the retrieval RPC contract check: Supabase is not configured.',
      );
      return;
    }

    this.logger.warn(
      `Could not verify the retrieval RPC contract at startup (transient?). ` +
        `Detail: ${status.message}`,
    );
  }
}
