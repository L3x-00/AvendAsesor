import type { DocumentLibraryPage } from './domain/document';

export interface DocumentLibraryCacheKeyInput {
  actorId: string;
  createdBy?: string;
  createdFrom?: string;
  createdTo?: string;
  documentType?: string;
  issuanceYear?: number;
  issuingEntity?: string;
  limit: number;
  moduleId?: string;
  offset: number;
  q?: string;
  situation?: string;
  sort: string;
  submoduleId?: string;
  technicalStatus?: string;
}

interface CacheEntry {
  expiresAt: number;
  page: DocumentLibraryPage;
}

const DEFAULT_MAX_ENTRIES = 120;
/**
 * Quince segundos: suficiente para que abrir y volver a abrir un módulo no
 * repita la consulta, y corto como para que un cambio hecho por otra vía se
 * note casi de inmediato. Las mutaciones hechas por esta misma instancia
 * invalidan la caché al instante.
 */
const DEFAULT_TTL_MS = 15_000;

/**
 * Clave estable por actor y consulta. El actor forma parte de la clave porque
 * la consulta se acota por permisos: dos administradores nunca comparten
 * resultado, aunque pidan exactamente lo mismo.
 */
export function documentLibraryCacheKey(
  input: DocumentLibraryCacheKeyInput,
): string {
  return JSON.stringify([
    input.actorId,
    input.q ?? '',
    input.issuanceYear ?? '',
    input.documentType ?? '',
    input.issuingEntity ?? '',
    input.moduleId ?? '',
    input.submoduleId ?? '',
    input.situation ?? '',
    input.technicalStatus ?? '',
    input.sort,
    input.limit,
    input.offset,
    input.createdFrom ?? '',
    input.createdTo ?? '',
    input.createdBy ?? '',
  ]);
}

/**
 * Caché en memoria, por proceso, de páginas de la biblioteca documental.
 *
 * Vive en la API porque ahí está la consulta pesada. Se acota por cantidad de
 * entradas y por tiempo, y se vacía cuando esta instancia modifica documentos.
 * No sustituye la autorización: cada clave incluye al actor y la consulta se
 * sigue acotando por permisos en la base.
 */
export class DocumentLibraryCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(
    options: {
      maxEntries?: number;
      now?: () => number;
      ttlMs?: number;
    } = {},
  ) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.now = options.now ?? (() => Date.now());
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  }

  get(key: string): DocumentLibraryPage | undefined {
    const entry = this.entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }

    // Reinsertar mantiene el orden de uso: el Map expulsa primero lo más viejo.
    this.entries.delete(key);
    this.entries.set(key, entry);

    return entry.page;
  }

  set(key: string, page: DocumentLibraryPage): void {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();

      if (!oldest.done) {
        this.entries.delete(oldest.value);
      }
    }

    this.entries.set(key, { expiresAt: this.now() + this.ttlMs, page });
  }

  /** Un documento cambió: ningún resultado anterior sirve. */
  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
