import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { INTERACTIVE_AI_LIMITS } from '../config/ai-gateway';
import type { EmbeddingsGateway } from '../ingestion/embeddings.gateway';
import { EMBEDDINGS_GATEWAY } from '../ingestion/ingestion.tokens';
import { SUPABASE_RETRIEVAL_GATEWAY } from '../supabase/supabase.constants';
import { refersBack } from './anaphora';
import {
  asksForDates,
  contiguousSchedule,
  coversScheduleTopic,
  type DatedCandidate,
  distinctDatesIn,
  isScheduleEvidence,
  isScheduleTable,
  scheduleQuery,
  scheduleTopicTerms,
  withScheduleEvidence,
} from './dated-evidence';
import { hasTopicTerm } from './domain-lexicon';
import { asksForDocumentStatus } from './document-status';
import { consolidateDocumentEvidence } from './evidence-consolidation';
import { sanitizeRetrievedEvidence } from './evidence-sanitizer';
import {
  hasGeneralSalaryEvidence,
  isBroadSalaryQuestion,
  isSalarySourceCompatible,
  salaryApplicabilityTier,
  salaryQuestionProfile,
  withInheritedSalaryFactors,
} from './salary-applicability';
import { orderSourcesForDelivery } from './temporal-precedence';
import {
  exactDocumentReferencesIn,
  type ExactDocumentReference,
  sourceMatchesExactDocumentReference,
} from './legal-reference';
import {
  RAG_DEFAULT_MATCH_THRESHOLD,
  RAG_MAX_DELIVERED_SOURCES,
  RAG_MAX_SCHEDULE_ADDITIONS,
  RAG_QUERY_TEXT_MAX_CHARS,
  RAG_ROUTING_SCORE_MARGIN,
  RAG_SCHEDULE_CHUNKS_PER_VERSION,
  RAG_SCHEDULE_SEMANTIC_FLOOR,
  RAG_SOURCE_SCORE_MARGIN,
  RAG_TOPIC_SWITCH_SCORE_MARGIN,
} from './rag.constants';
import type {
  RetrievalGateway,
  RetrievedChunk,
  RetrievedModuleAssociation,
  RetrievalScope,
  VersionChunk,
} from './retrieval.gateway';
import { normalizeSpanishText } from './text-normalization';

export interface ResolvedModule {
  id: string;
  name: string;
}

export type RetrievalResult =
  | {
      kind: 'no_evidence';
      /** Referencias nombradas que aún no identifican una norma de forma unívoca. */
      incompleteExactReferences?: ExactDocumentReference[];
      /** Normas nombradas que no tienen evidencia aprobada utilizable. */
      missingExactReferences?: ExactDocumentReference[];
      topRelevanceScore: null;
    }
  | {
      kind: 'ambiguous';
      modules: ResolvedModule[];
      sources: RetrievedChunk[];
      topRelevanceScore: number;
    }
  | {
      kind: 'evidence';
      resolvedModule: ResolvedModule | null;
      sources: RetrievedChunk[];
      topRelevanceScore: number;
    }
  | {
      kind: 'topic_change';
      resolvedModule: ResolvedModule;
      sources: RetrievedChunk[];
      topRelevanceScore: number;
    };

interface SourceRoute {
  kind: 'ambiguous' | 'resolved';
  modules: ResolvedModule[];
  resolvedModule: ResolvedModule | null;
}

function sourceAssociations(
  source: RetrievedChunk,
): RetrievedModuleAssociation[] {
  if (source.moduleAssociations?.length) return source.moduleAssociations;

  return source.moduleIds.map((rootModuleId, index) => ({
    rootModuleId,
    rootModuleName: source.moduleNames[index] ?? 'Módulo sin nombre',
    submoduleId: null,
    submoduleName: null,
  }));
}

/** True when a root or a submodule is genuinely associated with the source. */
function sourceIncludesContext(
  source: RetrievedChunk,
  moduleOrSubmoduleId: string,
): boolean {
  return sourceAssociations(source).some(
    (association) =>
      association.rootModuleId === moduleOrSubmoduleId ||
      association.submoduleId === moduleOrSubmoduleId,
  );
}

/**
 * Evidencia entregable de un proceso resuelto: se conserva lo atribuible al
 * módulo (o sin asociaciones, que no contradice la ruta) y se descarta la cola
 * de otros procesos, para que la lista de referencias de una respuesta no
 * mezcle documentación de procesos no relacionados.
 */
function attributableToModule(
  sources: RetrievedChunk[],
  moduleId: string,
): RetrievedChunk[] {
  return sources.filter((source) => {
    const associations = sourceAssociations(source);
    return associations.length === 0 || sourceIncludesContext(source, moduleId);
  });
}

/**
 * A submodule is disclosed only when every recovered source has one identical
 * submodule association below the detected root. This avoids inventing a
 * narrow route for documents that were associated directly with the root.
 */
export function resolveDetectedSubmodule(
  sources: RetrievedChunk[],
  rootModuleId: string,
): ResolvedModule | null {
  if (!sources.length) return null;

  let common: Map<string, string> | null = null;
  for (const source of sources) {
    const candidates = new Map<string, string>();
    for (const association of sourceAssociations(source)) {
      if (
        association.rootModuleId === rootModuleId &&
        association.submoduleId !== null &&
        association.submoduleName !== null
      ) {
        candidates.set(association.submoduleId, association.submoduleName);
      }
    }
    if (!candidates.size) return null;
    if (common === null) {
      common = candidates;
    } else {
      const intersection = new Map<string, string>();
      common.forEach((name, id) => {
        if (candidates.has(id)) intersection.set(id, name);
      });
      common = intersection;
    }
    if (!common.size) return null;
  }

  if (common?.size !== 1) return null;
  const entry = common ? Array.from(common.entries())[0] : undefined;
  if (!entry) return null;
  const [id, name] = entry;
  return { id, name };
}

function resolveSelectedRootModule(
  sources: RetrievedChunk[],
  selectedModuleId: string,
): ResolvedModule | null {
  const roots = new Map<string, string>();
  for (const source of sources) {
    for (const association of sourceAssociations(source)) {
      if (
        association.rootModuleId === selectedModuleId ||
        association.submoduleId === selectedModuleId
      ) {
        roots.set(association.rootModuleId, association.rootModuleName);
      }
    }
  }
  if (roots.size !== 1) return null;
  const [id, name] = roots.entries().next().value as [string, string];
  return { id, name };
}

function clampScore(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function topScore(sources: RetrievedChunk[]): number {
  return clampScore(Math.max(...sources.map((source) => source.semanticScore)));
}

function evidenceTokens(content: string): string[] {
  return normalizeSpanishText(content)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}

const LEXICAL_STOP_WORDS = new Set([
  'aunque',
  'cual',
  'cuales',
  'cuando',
  'cuanta',
  'cuantas',
  'cuanto',
  'cuantos',
  'debe',
  'deben',
  'debo',
  'desde',
  'donde',
  'esta',
  'estas',
  'este',
  'estos',
  'hace',
  'hacer',
  'hasta',
  'los',
  'mas',
  'menos',
  'muy',
  'necesita',
  'necesito',
  'para',
  'pero',
  'porque',
  'presentar',
  'presento',
  'puede',
  'pueden',
  'que',
  'solicitar',
  'solicito',
  'solo',
  'sobre',
  'tambien',
  'tiene',
  'tienen',
  'todo',
  'toda',
  'todos',
  'todas',
  'una',
  'uno',
  'unos',
  'unas',
]);

function lexicalQueryTerms(text: string): string[] {
  return [
    ...new Set(
      (normalizeSpanishText(text).match(/[\p{L}\p{N}]{4,}/gu) ?? []).filter(
        (term) => !LEXICAL_STOP_WORDS.has(term),
      ),
    ),
  ];
}

/**
 * El rescate léxico no se conforma con una palabra común: exige que el
 * fragmento cubra al menos dos términos de la consulta (o uno cuando la
 * consulta solo tiene uno o dos). Sin esta comprobación, una coincidencia
 * débil podía reabrir la banda de «sin evidencia» que el umbral semántico
 * acababa de cerrar.
 */
function lexicalCoverage(question: string, content: string): boolean {
  const terms = lexicalQueryTerms(question);
  if (!terms.length) return false;
  // Un término corto y genérico («plazo») no basta para reabrir el fail-closed.
  if (terms.length === 1 && terms[0].length < 7) return false;
  const words = normalizeSpanishText(content).match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  const matched = terms.filter((term) => {
    const prefix = term.slice(0, Math.max(4, term.length - 2));
    return words.some(
      (word) => word.startsWith(prefix) || prefix.startsWith(word),
    );
  });
  return matched.length >= (terms.length <= 1 ? 1 : 2);
}

/**
 * Quita fragmentos vecinos repetidos de una misma versión. Esta colección se
 * usa para decidir la ruta: no se puede colapsar aún evidencia de documentos
 * distintos porque podría ocultar un segundo módulo aplicable.
 */
function sourcesWithoutVersionDuplicates(
  sources: RetrievedChunk[],
): RetrievedChunk[] {
  const kept: Array<{
    source: RetrievedChunk;
    text: string;
  }> = [];
  for (const source of sources) {
    const text = evidenceTokens(source.chunkContent).join(' ');
    const repeated = kept.some((item) => {
      return (
        item.source.documentVersionId === source.documentVersionId &&
        (item.text === text || item.text.includes(text))
      );
    });
    if (!repeated) kept.push({ source, text });
  }
  return kept.map((item) => item.source);
}

/**
 * Quita evidencia idéntica para una respuesta visible. Entre documentos solo
 * colapsa texto normalizado idéntico: una diferencia breve puede contener una
 * excepción, negación, importe o condición jurídica material y por eso se
 * conserva. La decisión de módulo siempre se toma antes, con
 * `sourcesWithoutVersionDuplicates`.
 */
function uniqueSources(sources: RetrievedChunk[]): RetrievedChunk[] {
  const kept: Array<{
    source: RetrievedChunk;
    text: string;
  }> = [];
  for (const source of sourcesWithoutVersionDuplicates(sources)) {
    const text = evidenceTokens(source.chunkContent).join(' ');
    const repeated = kept.some((item) => item.text === text);
    if (!repeated) kept.push({ source, text });
  }
  return kept.map((item) => item.source);
}

/**
 * La situación documental y los factores explícitos de una consulta salarial
 * se aplican antes de comparar puntajes. Una similitud alta no vuelve vigente a
 * una fuente reemplazada ni hace aplicable una cifra de otra jornada, cargo,
 * condición, escala o período.
 */
function sourcesEligibleForQuestion(
  sources: RetrievedChunk[],
  question: string,
  retrievalScope: RetrievalScope,
): RetrievedChunk[] {
  return sources.filter((source) => {
    if (
      retrievalScope === 'current' &&
      source.documentSituation !== 'current'
    ) {
      return false;
    }
    return isSalarySourceCompatible(question, source);
  });
}

/** Fuentes a no más de `margin` del mejor puntaje, en su orden original. */
function withinScoreMargin(
  sources: RetrievedChunk[],
  margin: number,
): RetrievedChunk[] {
  if (!sources.length) return sources;
  const best = Math.max(...sources.map((source) => source.semanticScore));
  return sources.filter((source) => source.semanticScore >= best - margin);
}

/**
 * Consolida la evidencia por documento y la ordena con precedencia temporal
 * determinista. Un documento no debe ocupar varias referencias por fragmentos
 * contiguos y la situación documental pesa más que el año.
 */
function prepareDelivery(
  sources: RetrievedChunk[],
  question?: string,
): RetrievedChunk[] {
  return orderSourcesForDelivery(
    consolidateDocumentEvidence(sources),
    question
      ? {
          applicability: (source: RetrievedChunk) =>
            salaryApplicabilityTier(question, source),
        }
      : {},
  );
}

/**
 * Evidencia que se entrega al modelo y al usuario: dentro de la banda de
 * relevancia, consolidada por documento (una referencia visible por versión,
 * salvo que otra ubicación aporte algo materialmente distinto) y en orden
 * determinista con precedencia temporal. `question` aporta la aplicabilidad al
 * concepto consultado: en una consulta salarial, la remuneración general
 * vigente precede a una asignación especial.
 */
function relevantSources(
  sources: RetrievedChunk[],
  limit: number,
  question?: string,
  scoreMargin = RAG_SOURCE_SCORE_MARGIN,
): RetrievedChunk[] {
  const eligible = prepareDelivery(
    withinScoreMargin(uniqueSources(byScoreDescending(sources)), scoreMargin),
    question,
  );
  const distinctDocuments = new Set(
    eligible.map((source) => source.documentVersionId),
  ).size;
  // Reserva la mayoría de plazas iniciales para versiones distintas. Después
  // vuelve al orden por relevancia y completa con chunks vecinos del mismo
  // documento, necesarios para condiciones y excepciones.
  const diversityTarget = Math.min(
    distinctDocuments,
    Math.max(1, Math.ceil(limit * 0.6)),
  );
  const selected: RetrievedChunk[] = [];
  const selectedChunks = new Set<string>();
  const selectedDocuments = new Set<string>();

  for (const source of eligible) {
    if (selectedDocuments.has(source.documentVersionId)) continue;
    selected.push(source);
    selectedChunks.add(source.chunkId);
    selectedDocuments.add(source.documentVersionId);
    if (selectedDocuments.size === diversityTarget) break;
  }
  for (const source of eligible) {
    if (selected.length === limit) break;
    if (selectedChunks.has(source.chunkId)) continue;
    selected.push(source);
  }
  return selected;
}

function byScoreDescending(sources: RetrievedChunk[]): RetrievedChunk[] {
  return [...sources].sort(
    (left, right) =>
      right.semanticScore - left.semanticScore ||
      right.lexicalScore - left.lexicalScore,
  );
}

function balancedUniqueSources(
  limit: number,
  ...groups: RetrievedChunk[][]
): RetrievedChunk[] {
  const result: RetrievedChunk[] = [];
  const seen = new Set<string>();
  const longestGroup = Math.max(0, ...groups.map((group) => group.length));

  for (
    let index = 0;
    index < longestGroup && result.length < limit;
    index += 1
  ) {
    for (const group of groups) {
      const source = group[index];
      if (!source || seen.has(source.chunkId)) continue;
      seen.add(source.chunkId);
      result.push(source);
      if (result.length === limit) break;
    }
  }

  return result;
}

/**
 * Palabras de los nombres de módulo que no discriminan entre procesos: son
 * genéricas del dominio (docente, educación), funcionales (para, como) o
 * describen un aspecto administrativo común (situaciones). Su presencia en la
 * consulta no debe desempatar un conflicto entre módulos.
 */
const MODULE_NAME_STOPWORDS = new Set([
  'como',
  'desde',
  'docencia',
  'docente',
  'docentes',
  'educacion',
  'entre',
  'general',
  'hacia',
  'magisterial',
  'otros',
  'para',
  'situaciones',
  'sobre',
]);

function significantModuleTokens(name: string): string[] {
  return normalizeSpanishText(name)
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= 4 && !MODULE_NAME_STOPWORDS.has(token));
}

/**
 * Variantes coloquiales verificadas contra consultas reales: la gente escribe
 * «contrato docente» donde el módulo dice «contratación». Solo se registran
 * pares probados; no se inventan sinónimos.
 */
const QUESTION_WORD_ALIASES: Record<string, string> = {
  contrato: 'contratacion',
  contratos: 'contratacion',
};

/** Coincidencia por palabra completa o flexión (plural/sufijo cercano). */
function questionWordMatchesToken(word: string, token: string): boolean {
  const candidate = QUESTION_WORD_ALIASES[word] ?? word;
  if (candidate.length < 4) return false;
  if (candidate.startsWith(token)) return true;
  // «remuneracion» → «remuneraciones» sí; «administra» → «administrativas»
  // no (proporción demasiado corta, sería un falso positivo genérico).
  return token.startsWith(candidate) && candidate.length / token.length >= 0.8;
}

function questionMentionsModuleToken(
  normalizedQuestion: string,
  token: string,
): boolean {
  return normalizedQuestion
    .split(/[^a-z0-9]+/u)
    .some((word) => questionWordMatchesToken(word, token));
}

/**
 * Cuando dos módulos compiten por puntajes casi idénticos, el nombre del
 * módulo mencionado en la propia consulta («contratación docente» frente a
 * «auxiliares») desempata: pedir precisión a quien ya nombró su tema es un
 * falso positivo. Solo resuelve con una ventaja estricta sobre el segundo
 * candidato; un empate mantiene la aclaración.
 */
export function disambiguateRouteByQuestion(
  question: string,
  modules: ResolvedModule[],
  sources: RetrievedChunk[] = [],
): ResolvedModule | null {
  if (modules.length < 2) return null;
  const normalizedQuestion = normalizeSpanishText(question);
  const comparison = /\b(?:compara\w*|diferencia\w*|versus|vs)\b/u.test(
    normalizedQuestion,
  );
  const score = (includeSubmodules: boolean) =>
    modules
      .map((module) => {
        const matchedTokens = [
          ...new Set(
            [
              module.name,
              ...(includeSubmodules ? sources : []).flatMap((source) =>
                sourceAssociations(source)
                  .filter(
                    (association) => association.rootModuleId === module.id,
                  )
                  .map((association) => association.submoduleName ?? ''),
              ),
            ].flatMap(significantModuleTokens),
          ),
        ].filter((token) =>
          questionMentionsModuleToken(normalizedQuestion, token),
        );
        return { module, matchedTokens, hits: matchedTokens.length };
      })
      .filter((entry) => entry.hits > 0)
      .sort((left, right) => right.hits - left.hits);
  // Los nombres de raíz conservan su precedencia. Una palabra genérica de un
  // submódulo vecino no borra un proceso ya explícito («contrato docente»).
  if (comparison) {
    const candidates = score(true);
    const distinctive = candidates.filter((candidate) =>
      candidate.matchedTokens.some(
        (token) =>
          !candidates.some(
            (other) =>
              other.module.id !== candidate.module.id &&
              other.matchedTokens.includes(token),
          ),
      ),
    );
    if (distinctive.length > 1) return null;
  }
  for (const includeSubmodules of [false, true]) {
    const scored = score(includeSubmodules);
    if (comparison && scored.length > 1) return null;
    const [best, second] = scored;
    if (best && best.hits > (second?.hits ?? 0)) return best.module;
  }
  return null;
}

/**
 * Decide el módulo de la evidencia. Solo cuentan las fuentes dominantes (a
 * `RAG_ROUTING_SCORE_MARGIN` del mejor puntaje): una fuente de cola de otro
 * módulo no es una segunda interpretación real. Si todas comparten al menos un
 * módulo, la ruta está resuelta —también cuando un mismo documento está
 * asociado a varios módulos—; solo hay ambigüedad cuando las fuentes dominantes
 * apuntan a módulos distintos sin ninguno en común.
 */
function routeSources(allSources: RetrievedChunk[]): SourceRoute {
  const sources = withinScoreMargin(allSources, RAG_ROUTING_SCORE_MARGIN);
  const modules = new Map<string, string>();
  let commonModuleIds: Set<string> | null = null;

  for (const source of sources) {
    const sourceModuleIds = new Set(source.moduleIds);
    commonModuleIds = commonModuleIds
      ? new Set([...commonModuleIds].filter((id) => sourceModuleIds.has(id)))
      : sourceModuleIds;

    source.moduleIds.forEach((id, index) => {
      modules.set(id, source.moduleNames[index] ?? 'Módulo sin nombre');
    });
  }

  const sortedModules = [...modules]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) =>
      left.name.localeCompare(right.name, 'es', { sensitivity: 'base' }),
    );
  const common = new Set(commonModuleIds ?? []);

  if (common.size >= 1) {
    // Módulo común preferido: el primero de la fuente mejor puntuada.
    const id =
      sources[0]?.moduleIds.find((moduleId) => common.has(moduleId)) ??
      [...common][0];
    if (!id) throw new Error('RAG_INVALID_MODULE_ROUTE');
    return {
      kind: 'resolved',
      modules: sortedModules,
      resolvedModule: {
        id,
        name: modules.get(id) ?? 'Módulo sin nombre',
      },
    };
  }

  if (sortedModules.length === 1) {
    return {
      kind: 'resolved',
      modules: sortedModules,
      resolvedModule: sortedModules[0] ?? null,
    };
  }

  return {
    kind: 'ambiguous',
    modules: sortedModules,
    resolvedModule: null,
  };
}

function cleanContextValue(value: string): string {
  return [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127)
        ? ' '
        : character;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function contextualQuery(
  question: string,
  priorUserQuestions: string[],
): string {
  if (!priorUserQuestions.length) return question;
  // Presupuesto dentro del límite de texto de la RPC (8.000); si no alcanza se
  // conservan las consultas más recientes (el final del contexto).
  const budget = RAG_QUERY_TEXT_MAX_CHARS - question.length - 64;
  if (budget <= 0) return question;
  const context = priorUserQuestions
    .slice(-4)
    .map(cleanContextValue)
    .filter(Boolean)
    .join(' | ')
    .slice(-budget)
    .trim();

  return context
    ? `Consultas anteriores: ${context}\nPregunta actual: ${question}`
    : question;
}

/**
 * Un seguimiento elíptico ("¿y cuál es el plazo?", "¿y para auxiliares?") o
 * que remite a lo anterior ("¿y me pagan durante ese tiempo?") solo se entiende
 * con las consultas previas. Uno que nombra su propio tema sin remitir a lo
 * anterior ("¿y para una permuta?") se busca por sí mismo en la búsqueda global.
 */
export function isEllipticalFollowUp(question: string): boolean {
  const normalized = normalizeSpanishText(question);
  return !hasTopicTerm(normalized) || refersBack(question);
}

/**
 * Prefijos de contexto sintético que no son declaraciones de la persona: el
 * extracto de una respuesta anterior o la propuesta que el asistente formuló y
 * la persona aceptó. No deben heredar factores salariales.
 */
const SYNTHETIC_CONTEXT_PREFIX = /^(?:Respuesta anterior|Propuesta aceptada):/u;

/**
 * Consultas previas cuyos factores declarados completan la actual: solo la
 * respuesta a una aclaración (o un seguimiento elíptico) hereda; una consulta
 * con tema propio es una pregunta nueva. El extracto de una respuesta anterior
 * del asistente no es una declaración de la persona.
 */
export function inheritedFactorQuestions(
  question: string,
  priorUserQuestions: readonly string[],
  forceContext: boolean,
): string[] {
  if (!priorUserQuestions.length) return [];
  if (
    !salaryQuestionProfile(question).isSalaryQuestion &&
    SELF_CONTAINED_NON_SALARY.test(normalizeSpanishText(question))
  ) {
    return [];
  }
  // Forzar contexto por una aclaración no debe convertir una nueva pregunta
  // salarial con cargo propio en una continuación de la anterior.
  if (
    (!forceContext || salaryQuestionProfile(question).isSalaryQuestion) &&
    !continuesSalaryThread(question)
  )
    return [];
  const turns = priorUserQuestions.filter(
    (prior) => !SYNTHETIC_CONTEXT_PREFIX.test(prior),
  );
  // Se hereda desde la consulta salarial más reciente hasta ahora. Si entre
  // ella y este turno hubo una consulta con tema propio que no es salarial, la
  // conversación cambió de tema y esos factores ya no describen a la persona.
  const inherited: string[] = [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    inherited.unshift(turns[index]);
    const turnProfile = salaryQuestionProfile(turns[index]);
    if (turnProfile.isSalaryQuestion) {
      // Una pregunta salarial elíptica también puede necesitar el cargo y el
      // sector del inicio del hilo: «¿y cuánto gana por 30 horas?» no es una
      // consulta completa por sí sola.
      const ellipticalSalary =
        turnProfile.role === null && continuesSalaryThread(turns[index]);
      if (!ellipticalSalary) return inherited;
      continue;
    }
    if (!continuesSalaryThread(turns[index])) return [];
  }
  return [];
}

/** En una consulta salarial, estos términos de tema son factores de la cifra. */
const SALARY_FACTOR_TERMS =
  /\b(?:jornadas?|carga horaria|escala magisterial|escala remunerativa)\b/gu;

/**
 * Un turno sigue el hilo de una consulta salarial cuando es elíptico o cuando
 * solo nombra un factor de la cifra («Jornada de 30 horas», «Escala 2»): la
 * aclaración que se le hizo a la persona usa esas mismas palabras. Un turno con
 * otro tema propio («licencia por enfermedad») lo interrumpe.
 */
/**
 * Pedidos de documentos, requisitos, plazos o pasos que no son salariales. Son
 * un cambio de aspecto dentro del tema, no una continuación de la cifra: no
 * deben heredar jornada, vínculo, escala ni año de una consulta salarial.
 */
const SELF_CONTAINED_NON_SALARY =
  /\b(?:documentos?|archivos?|anexos?|expediente|requisitos?|plazos?|pasos?|procedimiento)\b/u;

function continuesSalaryThread(turn: string): boolean {
  // Solo es un factor de la cifra cuando trae su valor («jornada de 30 horas»,
  // «escala magisterial 2»); «¿cuál es la jornada laboral de un auxiliar?» es
  // otra pregunta.
  const profile = salaryQuestionProfile(turn);
  const declaresFactor =
    profile.jornadaHours !== null || profile.scale !== null;
  const normalized = normalizeSpanishText(turn);
  if (
    profile.isSalaryQuestion &&
    profile.role === null &&
    !profile.asksSpecialAllocation
  ) {
    const remainingTopic = normalized.replace(
      /\b(?:remuneracion(?:es)?|sueldos?|salarios?|cuanto\s+(?:gana|ganan|gano|ganaria)|sector\s+(?:public[oa]|privad[oa])|public[oa]|privad[oa]|jornadas?|carga horaria|escala magisterial|escala remunerativa)\b/gu,
      ' ',
    );
    // Solo formularios sin sujeto/cargo identificable heredan la consulta.
    // Cualquier palabra no reconocida se trata como tema propio, incluso sin
    // artículo («cuánto gana ingeniero»).
    const residue = remainingTopic
      .replace(
        /\b(?:y|e|o|pero|entonces|ademas|tambien|cuanto|cual|seria|gana|ganan|gano|ganaria|percibe|perciben|cobra|cobran|se|es|de|del|la|el|los|las|un|una|en|por|para|con|al|ano|anos|horas?|laboral|peru|mes|mensual(?:es)?|regimen)\b|\d+|[^a-z]+/gu,
        ' ',
      )
      .trim();
    return !hasTopicTerm(remainingTopic) && !residue;
  }
  if (!profile.isSalaryQuestion && SELF_CONTAINED_NON_SALARY.test(normalized)) {
    return false;
  }
  return (
    !hasTopicTerm(
      declaresFactor
        ? normalized.replace(SALARY_FACTOR_TERMS, ' ')
        : normalized,
    ) || refersBack(turn)
  );
}

const ARCHIVED_INTENT_PATTERNS = [
  /\barchivad[oa]s?\b/u,
  /\bantecedentes? historicos? especificos?\b/u,
  /\bconservad[oa]s? (?:unicamente |solo )?como antecedentes? historicos?\b/u,
];

const HISTORICAL_INTENT_PATTERNS = [
  /\bantecedentes?\b/u,
  /\bhistoric[oa]s?\b/u,
  /\bcompar(?:ar|acion|aciones|ativa|ativas|ativo|ativos)\b/u,
  /\bevolucion\b/u,
  /\b(?:diferencias?|cambios?) entre versiones?\b/u,
  /\bversion(?:es)? (?:anterior|anteriores|previa|previas)\b/u,
  /\b(?:norma|normativa|documento|regla)s? (?:anterior|anteriores|previa|previas)\b/u,
  /\b(?:reemplazad[oa]s?|derogad[oa]s?|sin vigencia)\b/u,
  /\b(?:antes|anteriormente)\b/u,
];

/**
 * Keeps historical material fail-closed unless the current question asks for
 * it explicitly. Archived material requires an even stronger explicit signal.
 */
export function detectRetrievalScope(
  question: string,
  currentYear = new Date().getUTCFullYear(),
): RetrievalScope {
  const normalized = normalizeSpanishText(question);

  if (ARCHIVED_INTENT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'archived_explicit';
  }

  if (
    HISTORICAL_INTENT_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    asksForDocumentStatus(question)
  ) {
    return 'historical';
  }

  const years = normalized.match(/\b(?:19|20)\d{2}\b/gu) ?? [];
  if (years.some((year) => Number(year) < currentYear)) {
    return 'historical';
  }

  return 'current';
}

/**
 * Otro fragmento de una versión ya entregada: hereda los datos del documento
 * (título, tipo, situación, módulos) y conserva su propia ubicación. Su
 * relevancia es la del documento que lo ancla: entra porque su archivo ya
 * sustenta la respuesta, no por parecerse a la pregunta.
 */
function chunkFromDeliveredVersion(
  anchor: RetrievedChunk,
  row: VersionChunk,
): RetrievedChunk {
  return {
    ...anchor,
    articleReference: row.articleReference,
    chunkContent: row.chunkContent,
    chunkId: row.chunkId,
    lexicalScore: 0,
    numeralReference: row.numeralReference,
    pageEnd: row.pageEnd,
    pageStart: row.pageStart,
    sectionTitle: row.sectionTitle,
    semanticScore: anchor.semanticScore,
  };
}

interface RetrieveOptions {
  forceContext?: boolean;
  /**
   * Consultas que pueden aportar factores salariales. Se separa del contexto
   * de recuperación para que una propuesta aceptada de otro tema no herede la
   * jornada o la escala de una consulta anterior.
   */
  salaryContextQuestions?: readonly string[];
  /** La persona pregunta por su propio caso; no se usa el atajo de panorama. */
  personalSalary?: boolean;
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    @Inject(EMBEDDINGS_GATEWAY) private readonly embeddings: EmbeddingsGateway,
    @Inject(SUPABASE_RETRIEVAL_GATEWAY)
    private readonly gateway: RetrievalGateway,
    private readonly config: ConfigService,
  ) {}

  /**
   * Evidencia del turno. Una pregunta por fechas («¿cuándo se dan los
   * destaques?») se completa además con el cronograma del tema: una tabla de
   * fechas casi nunca es el fragmento más parecido a la pregunta y, sin ella,
   * el modelo respondía con la definición del trámite en lugar de las fechas.
   */
  async retrieve(
    question: string,
    selectedModuleId: string | null,
    priorUserQuestions: string[] = [],
    options: RetrieveOptions = {},
  ): Promise<RetrievalResult> {
    const result = await this.retrieveEvidence(
      question,
      selectedModuleId,
      priorUserQuestions,
      options,
    );
    if (
      (result.kind !== 'evidence' && result.kind !== 'topic_change') ||
      !asksForDates(question)
    ) {
      return result;
    }
    const sources = await this.withScheduleSources(
      question,
      result.sources,
      result.resolvedModule?.id ?? selectedModuleId,
    );
    return sources === result.sources ? result : { ...result, sources };
  }

  /**
   * Primero se completa con el cronograma de los documentos ya admitidos como
   * evidencia; si ninguno trae una tabla de fechas del tema, se busca en el
   * módulo de la consulta. Es una mejora: si la lectura falla, la respuesta
   * sigue con la evidencia ya hallada.
   */
  private async withScheduleSources(
    question: string,
    delivered: RetrievedChunk[],
    moduleId: string | null,
  ): Promise<RetrievedChunk[]> {
    const room = Math.min(
      RAG_MAX_SCHEDULE_ADDITIONS,
      RAG_MAX_DELIVERED_SOURCES - delivered.length,
    );
    if (!delivered.length || room <= 0) return delivered;
    const terms = scheduleTopicTerms(question);
    try {
      const additions =
        (await this.scheduleFromDeliveredDocuments(delivered, terms)) ??
        (await this.scheduleFromModule(question, delivered, terms, moduleId));
      return additions.length
        ? withScheduleEvidence(delivered, additions.slice(0, room))
        : delivered;
    } catch (error: unknown) {
      this.logger.warn(
        `No se pudo completar el cronograma de una consulta por fechas: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
      return delivered;
    }
  }

  /** Fragmentos con fechas de los documentos dados, ya saneados. */
  private async datedCandidates(
    sources: RetrievedChunk[],
  ): Promise<DatedCandidate[]> {
    if (!this.gateway.datedChunksOfVersions) return [];
    const anchors = new Map<string, RetrievedChunk>();
    for (const source of sources) {
      if (!anchors.has(source.documentVersionId)) {
        anchors.set(source.documentVersionId, source);
      }
    }
    const versionOrder = [...anchors.keys()];
    const rows = await this.gateway.datedChunksOfVersions({
      limitPerVersion: RAG_SCHEDULE_CHUNKS_PER_VERSION,
      versionIds: versionOrder,
    });
    return rows.flatMap((row) => {
      const anchor = anchors.get(row.documentVersionId);
      const chunk = anchor
        ? sanitizeRetrievedEvidence(chunkFromDeliveredVersion(anchor, row))
        : null;
      if (!chunk) return [];
      return [
        {
          chunk,
          chunkIndex: row.chunkIndex,
          dates: distinctDatesIn(chunk.chunkContent).length,
          table: isScheduleTable(chunk.chunkContent),
          version: versionOrder.indexOf(row.documentVersionId),
        },
      ];
    });
  }

  /**
   * Cronograma de los documentos ya entregados. Si la evidencia ya trae una
   * tabla de fechas, se completa con sus fragmentos contiguos (el fragmentado
   * suele partirla); si no, se toma la tabla del tema con más fechas de esos
   * documentos. Un párrafo que remite al «cronograma que se adjunta» trae
   * pocas fechas sueltas y no cuenta como tabla. `null` cuando esos documentos
   * no tienen ninguna tabla del tema: entonces se busca en el módulo.
   */
  private async scheduleFromDeliveredDocuments(
    delivered: RetrievedChunk[],
    terms: string[],
  ): Promise<RetrievedChunk[] | null> {
    const deliveredChunks = new Set(delivered.map((source) => source.chunkId));
    const candidates = await this.datedCandidates(delivered);
    const deliveredTables = candidates.filter(
      (candidate) =>
        candidate.table && deliveredChunks.has(candidate.chunk.chunkId),
    );
    if (deliveredTables.length) {
      return contiguousSchedule(
        deliveredTables,
        candidates,
        deliveredChunks,
        terms,
      );
    }
    if (
      delivered.some((source) => isScheduleEvidence(source.chunkContent, terms))
    ) {
      return [];
    }
    const [best] = candidates
      .filter(
        (candidate) =>
          candidate.table &&
          !deliveredChunks.has(candidate.chunk.chunkId) &&
          coversScheduleTopic(candidate.chunk.chunkContent, terms, 'any'),
      )
      .sort(
        (left, right) =>
          right.dates - left.dates ||
          left.version - right.version ||
          left.chunkIndex - right.chunkIndex,
      );
    return best
      ? contiguousSchedule([best], candidates, deliveredChunks, terms)
      : null;
  }

  /**
   * Cronograma de otro documento del módulo de la consulta, con una búsqueda
   * canónica («cronograma de destaque 2026: actividades, fechas de inicio y
   * fin»). Solo se acepta una tabla de fechas que nombre cada término del
   * tema —el piso de similitud es más bajo que el general porque una tabla de
   * fechas apenas repite el tema— y se completa con sus fragmentos contiguos.
   */
  private async scheduleFromModule(
    question: string,
    delivered: RetrievedChunk[],
    terms: string[],
    moduleId: string | null,
  ): Promise<RetrievedChunk[]> {
    if (!moduleId || !terms.length) return [];
    const retrievalScope = detectRetrievalScope(question);
    const year = Number(
      normalizeSpanishText(question).match(/\b(?:19|20)\d{2}\b/u)?.[0] ??
        new Date().getUTCFullYear(),
    );
    const query = scheduleQuery(terms, year);
    const [embedding] = await this.embeddings.embed(
      [query],
      INTERACTIVE_AI_LIMITS,
    );
    if (embedding?.length !== 1536) return [];
    const deliveredChunks = new Set(delivered.map((source) => source.chunkId));
    const found = sourcesEligibleForQuestion(
      (
        (await this.gateway.search({
          embedding,
          matchCount: 10,
          matchThreshold: RAG_SCHEDULE_SEMANTIC_FLOOR,
          query,
          retrievalScope,
          selectedModuleId: moduleId,
        })) ?? []
      )
        .map(sanitizeRetrievedEvidence)
        .filter((source): source is RetrievedChunk => Boolean(source)),
      question,
      retrievalScope,
    ).find(
      (source) =>
        !deliveredChunks.has(source.chunkId) &&
        source.semanticScore >= RAG_SCHEDULE_SEMANTIC_FLOOR &&
        isScheduleEvidence(source.chunkContent, terms, 'all'),
    );
    if (!found) return [];
    const candidates = await this.datedCandidates([found]);
    const seed = candidates.find(
      (candidate) => candidate.chunk.chunkId === found.chunkId,
    );
    return seed
      ? contiguousSchedule([seed], candidates, deliveredChunks, terms)
      : [found];
  }

  private async retrieveEvidence(
    question: string,
    selectedModuleId: string | null,
    priorUserQuestions: string[],
    options: RetrieveOptions,
  ): Promise<RetrievalResult> {
    const directReferences = exactDocumentReferencesIn(question);
    const hasPrior = priorUserQuestions.length > 0;
    // Un seguimiento elíptico (o la respuesta a una aclaración, que completa la
    // pregunta pendiente) se busca con las consultas previas en TODAS las
    // búsquedas: con la pregunta escueta, "¿y el plazo?" coincidía con plazos de
    // otros temas y se declaraba un falso cambio de tema. Una consulta con tema
    // propio se busca tal cual en la global (que es la que detecta el cambio de
    // tema), y con contexto dentro del módulo de la conversación.
    // Los factores salariales que declararon los turnos previos siguen
    // vigentes en la respuesta a una aclaración y en un seguimiento.
    const inheritedFactors = inheritedFactorQuestions(
      question,
      options.salaryContextQuestions ?? priorUserQuestions,
      Boolean(options.forceContext),
    );
    const salaryQuestion = withInheritedSalaryFactors(
      question,
      inheritedFactors,
    );
    // El contexto previo se usa para resolver una elipsis, un deíctico, una
    // referencia documental o un factor salarial heredado. No se arrastra a una
    // consulta sustantiva solo porque el turno anterior fuera del mismo chat.
    const previousDocumentReference =
      /\b(?:primero?|segundo?|tercero?|anterior(?:es)?|mencionad[oa]s?|descargarl[oa]s?|descargal[oa]s?)\b/u.test(
        normalizeSpanishText(question),
      );
    const globalUsesContext =
      hasPrior &&
      (Boolean(options.forceContext) ||
        isEllipticalFollowUp(question) ||
        refersBack(question) ||
        previousDocumentReference ||
        inheritedFactors.length > 0);
    const contextual = hasPrior
      ? contextualQuery(question, priorUserQuestions)
      : question;
    const inheritedReferences =
      !directReferences.length && globalUsesContext
        ? ([...priorUserQuestions]
            .reverse()
            .map(exactDocumentReferencesIn)
            .find((references) => references.length > 0) ?? [])
        : [];
    const documentReferences = directReferences.length
      ? directReferences
      : inheritedReferences;
    const incompleteExactReferences = documentReferences.filter(
      (reference) => !reference.complete,
    );
    if (incompleteExactReferences.length) {
      return {
        incompleteExactReferences,
        kind: 'no_evidence',
        topRelevanceScore: null,
      };
    }
    const exactReferences = documentReferences.filter(
      (reference) => reference.complete,
    );
    const retrievalScope = detectRetrievalScope(
      inheritedReferences.length ? contextual : question,
    );
    const globalQuery = globalUsesContext ? contextual : question;
    // Si la pregunta tiene tema propio y no remite al turno anterior, la
    // búsqueda del módulo también usa la pregunta sola. Así un tema nuevo no
    // recibe evidencia del tema anterior solo porque el módulo esté fijado.
    const selectedQuery = globalUsesContext ? contextual : question;
    const queries =
      // Exact retrieval only consumes the global vector; its module view is
      // derived from those same candidates, without a second vector search.
      !exactReferences.length &&
      selectedModuleId &&
      selectedQuery !== globalQuery
        ? [globalQuery, selectedQuery]
        : [globalQuery];
    const embeddings = await this.embeddings.embed(
      queries,
      INTERACTIVE_AI_LIMITS,
    );
    const globalEmbedding = embeddings[0];
    const selectedEmbedding = embeddings.at(-1);

    if (
      !globalEmbedding ||
      globalEmbedding.length !== 1536 ||
      !selectedEmbedding ||
      selectedEmbedding.length !== 1536
    ) {
      throw new Error('RAG_INVALID_QUERY_EMBEDDING');
    }

    const matchCount = this.config.get<number>('RAG_MATCH_COUNT') ?? 5;
    const searchBase = {
      // Holgura para descartar duplicados y fuentes fuera de banda sin quedarse
      // corto; la RPC admite hasta 10.
      matchCount: Math.min(10, matchCount * 2),
      matchThreshold:
        this.config.get<number>('RAG_MATCH_THRESHOLD') ??
        RAG_DEFAULT_MATCH_THRESHOLD,
      retrievalScope,
    };
    let rawGlobalSources: RetrievedChunk[];
    let rawSelectedSources: RetrievedChunk[];
    if (exactReferences.length) {
      // Sin una ruta exacta nunca se degrada a similitud: un doble antiguo o
      // una migración ausente debe producir «sin evidencia», no una norma
      // parecida que aparente responder el número solicitado.
      if (!this.gateway.searchExactReferences) {
        return {
          kind: 'no_evidence',
          missingExactReferences: exactReferences,
          topRelevanceScore: null,
        };
      }
      const exactCandidates = (
        await this.gateway.searchExactReferences({
          embedding: globalEmbedding,
          matchCount: searchBase.matchCount,
          query: globalQuery,
          referenceKeys: exactReferences.map(
            (reference) => reference.lookupKey,
          ),
          retrievalScope,
        })
      )
        .map(sanitizeRetrievedEvidence)
        .filter((source): source is RetrievedChunk => Boolean(source))
        .filter((source) =>
          exactReferences.some((reference) =>
            sourceMatchesExactDocumentReference(source, reference),
          ),
        );
      const missingExactReferences = exactReferences.filter(
        (reference) =>
          !exactCandidates.some((source) =>
            sourceMatchesExactDocumentReference(source, reference),
          ),
      );
      if (missingExactReferences.length) {
        return {
          kind: 'no_evidence',
          missingExactReferences,
          topRelevanceScore: null,
        };
      }
      rawGlobalSources = exactCandidates;
      rawSelectedSources = selectedModuleId
        ? exactCandidates.filter((source) =>
            sourceIncludesContext(source, selectedModuleId),
          )
        : [];
    } else {
      const globalSearch = this.gateway.search({
        ...searchBase,
        embedding: globalEmbedding,
        query: globalQuery,
        selectedModuleId: null,
      });
      const selectedSearch = selectedModuleId
        ? this.gateway.search({
            ...searchBase,
            embedding: selectedEmbedding,
            query: selectedQuery,
            selectedModuleId,
          })
        : Promise.resolve<RetrievedChunk[]>([]);
      [rawGlobalSources, rawSelectedSources] = await Promise.all([
        globalSearch,
        selectedSearch,
      ]);
    }
    // La ruta conserva las asociaciones de todos los documentos pertinentes.
    // La deduplicación interdocumental ocurre solo al armar las fuentes que se
    // entregan al modelo y a la interfaz, nunca antes de decidir el módulo.
    const routingSources = (sources: RetrievedChunk[]): RetrievedChunk[] =>
      sourcesWithoutVersionDuplicates(
        byScoreDescending(
          sourcesEligibleForQuestion(
            sources
              .map(sanitizeRetrievedEvidence)
              .filter((source): source is RetrievedChunk => Boolean(source)),
            salaryQuestion,
            retrievalScope,
          ),
        ),
      );
    let globalRoutingSources = routingSources(rawGlobalSources);
    let selectedRoutingSources = routingSources(rawSelectedSources);
    // Una pregunta salarial general suele mezclar documentos de contratación,
    // CTS y bonificaciones. Si esos fragmentos no contienen la escala general,
    // se busca además la tabla de remuneraciones con una consulta canónica para
    // no responder solo con conceptos adicionales.
    const broadSalaryProfile = salaryQuestionProfile(question);
    if (
      !selectedModuleId &&
      !options.personalSalary &&
      isBroadSalaryQuestion(question) &&
      (broadSalaryProfile.role === null ||
        broadSalaryProfile.role === 'docente')
    ) {
      const salaryQuery =
        'remuneración íntegra mensual RIM docente escala magisterial nivel inicial primaria secundaria EBR EBE EBA ETP';
      const [salaryEmbedding] = await this.embeddings.embed(
        [salaryQuery],
        INTERACTIVE_AI_LIMITS,
      );
      if (salaryEmbedding?.length === 1536) {
        const salarySources = (
          (await this.gateway.search({
            ...searchBase,
            embedding: salaryEmbedding,
            query: salaryQuery,
            selectedModuleId: null,
          })) ?? []
        ).filter(
          (candidate) => candidate.semanticScore >= searchBase.matchThreshold,
        );
        globalRoutingSources = routingSources([
          ...rawGlobalSources,
          ...salarySources,
        ]);
      }
    }
    if (!globalRoutingSources.length && !selectedRoutingSources.length) {
      // Rescate léxico: si la similitud vectorial no deja ningún candidato,
      // se recuperan los fragmentos con coincidencia de términos de la misma
      // consulta. El umbral semántico se relaja solo para esta comprobación y
      // se exige una coincidencia léxica real y una similitud mínima; si no
      // hay ninguna, el turno sigue siendo «sin evidencia».
      const semanticFloor = Math.max(0.45, searchBase.matchThreshold - 0.05);
      const lexicalSearch = (
        embedding: number[],
        query: string,
        moduleId: string | null,
      ) =>
        this.gateway
          .search({
            ...searchBase,
            embedding,
            matchThreshold: 0,
            query,
            selectedModuleId: moduleId,
          })
          .then((sources) =>
            routingSources(
              sources.filter(
                (candidate) =>
                  candidate.lexicalScore > 0 &&
                  candidate.semanticScore > semanticFloor &&
                  lexicalCoverage(query, candidate.chunkContent),
              ),
            ),
          );
      [globalRoutingSources, selectedRoutingSources] = await Promise.all([
        lexicalSearch(globalEmbedding, globalQuery, null),
        selectedModuleId
          ? lexicalSearch(selectedEmbedding, selectedQuery, selectedModuleId)
          : Promise.resolve([] as RetrievedChunk[]),
      ]);
    }
    if (!globalRoutingSources.length && !selectedRoutingSources.length) {
      return { kind: 'no_evidence', topRelevanceScore: null };
    }

    if (!selectedModuleId) {
      const route = routeSources(globalRoutingSources);
      // En un panorama salarial general se entregan todas las fuentes
      // salariales pertinentes, aunque la ruta se haya resuelto a un módulo
      // dominante: la tabla de remuneraciones puede estar en otro documento.
      if (
        !options.personalSalary &&
        isBroadSalaryQuestion(question) &&
        hasGeneralSalaryEvidence(globalRoutingSources, retrievalScope)
      ) {
        const sources = relevantSources(
          globalRoutingSources,
          matchCount,
          salaryQuestion,
          1,
        );
        if (sources.length) {
          return {
            kind: 'evidence',
            resolvedModule:
              route.kind === 'resolved' ? route.resolvedModule : null,
            sources,
            topRelevanceScore: topScore(sources),
          };
        }
      }
      if (route.kind === 'ambiguous') {
        // Una consulta salarial general no se convierte en una pregunta por el
        // caso propio: si hay montos recuperados, se responde con el panorama
        // y las condiciones que cambian la cifra. La ambigüedad de módulo no
        // demuestra que las fuentes sean inaplicables. Va antes de elegir un
        // módulo por mención porque el panorama debe conservar todas las
        // fuentes salariales pertinentes.
        if (!options.personalSalary && isBroadSalaryQuestion(question)) {
          const sources = relevantSources(
            globalRoutingSources,
            matchCount,
            salaryQuestion,
            1,
          );
          if (
            sources.length &&
            hasGeneralSalaryEvidence(sources, retrievalScope)
          ) {
            return {
              kind: 'evidence',
              resolvedModule: null,
              sources,
              topRelevanceScore: topScore(sources),
            };
          }
        }

        // Antes de pedir precisión: si la consulta nombra a uno de los módulos
        // en conflicto, ese es el tema real y se responde con su evidencia.
        const namedModule = disambiguateRouteByQuestion(
          question,
          route.modules,
          globalRoutingSources,
        );
        const scopedSources = namedModule
          ? attributableToModule(globalRoutingSources, namedModule.id)
          : [];
        if (namedModule && scopedSources.length) {
          const sources = relevantSources(
            scopedSources,
            matchCount,
            salaryQuestion,
          );
          return {
            kind: 'evidence',
            resolvedModule: namedModule,
            sources,
            topRelevanceScore: topScore(sources),
          };
        }

        const sources = relevantSources(
          globalRoutingSources,
          matchCount,
          salaryQuestion,
        );
        return {
          kind: 'ambiguous',
          modules: route.modules,
          sources,
          topRelevanceScore: topScore(sources),
        };
      }
      const resolvedModule = route.resolvedModule;
      const sources = relevantSources(
        resolvedModule
          ? attributableToModule(globalRoutingSources, resolvedModule.id)
          : globalRoutingSources,
        matchCount,
        salaryQuestion,
      );
      return {
        kind: 'evidence',
        resolvedModule,
        sources,
        topRelevanceScore: topScore(sources),
      };
    }

    const dominantGlobal = withinScoreMargin(
      globalRoutingSources,
      RAG_ROUTING_SCORE_MARGIN,
    );
    const currentRoute = globalRoutingSources.length
      ? routeSources(globalRoutingSources)
      : null;
    if (currentRoute) {
      if (
        currentRoute.kind === 'resolved' &&
        currentRoute.resolvedModule &&
        currentRoute.resolvedModule.id !== selectedModuleId &&
        !dominantGlobal.some((source) =>
          sourceIncludesContext(source, selectedModuleId),
        )
      ) {
        const globalScore = topScore(globalRoutingSources);
        const selectedScore = selectedRoutingSources.length
          ? topScore(selectedRoutingSources)
          : null;
        if (
          selectedScore === null ||
          globalScore - selectedScore >= RAG_TOPIC_SWITCH_SCORE_MARGIN
        ) {
          const sources = relevantSources(
            attributableToModule(
              globalRoutingSources,
              currentRoute.resolvedModule.id,
            ),
            matchCount,
            salaryQuestion,
          );
          return {
            kind: 'topic_change',
            resolvedModule: currentRoute.resolvedModule,
            sources,
            topRelevanceScore: topScore(sources),
          };
        }

        const competingCandidates = balancedUniqueSources(
          10,
          withinScoreMargin(globalRoutingSources, RAG_SOURCE_SCORE_MARGIN),
          withinScoreMargin(selectedRoutingSources, RAG_SOURCE_SCORE_MARGIN),
        );
        const competingSources = prepareDelivery(
          uniqueSources(byScoreDescending(competingCandidates)),
          salaryQuestion,
        );
        return {
          kind: 'ambiguous',
          // La ruta conserva ambos temas candidatos aunque sus extractos sean
          // equivalentes; la lista visible no los repite.
          modules: routeSources(competingCandidates).modules,
          sources: competingSources,
          topRelevanceScore: Math.max(globalScore, selectedScore),
        };
      }

      if (
        currentRoute.kind === 'ambiguous' &&
        !dominantGlobal.some((source) =>
          sourceIncludesContext(source, selectedModuleId),
        )
      ) {
        // La consulta puede nombrar el proceso de otro módulo aunque la
        // conversación esté abierta en uno distinto: si nombra uno de los
        // módulos en conflicto, ese es el tema y no corresponde pedir una
        // aclaración (OBS-014).
        const namedModule = disambiguateRouteByQuestion(
          question,
          currentRoute.modules,
          globalRoutingSources,
        );
        if (namedModule) {
          const sources = relevantSources(
            attributableToModule(globalRoutingSources, namedModule.id),
            matchCount,
            salaryQuestion,
          );
          if (sources.length) {
            return {
              kind: 'topic_change',
              resolvedModule: namedModule,
              sources,
              topRelevanceScore: topScore(sources),
            };
          }
        }

        const sources = relevantSources(
          globalRoutingSources,
          matchCount,
          salaryQuestion,
        );
        return {
          kind: 'ambiguous',
          modules: currentRoute.modules,
          sources,
          topRelevanceScore: topScore(sources),
        };
      }
    }

    if (selectedRoutingSources.length) {
      // Subtema dentro del mismo módulo: la evidencia global que pertenece al
      // módulo seleccionado también cuenta ("¿y para una permuta?" dentro de
      // Desplazamientos), no solo la de la búsqueda acotada.
      const sources = relevantSources(
        byScoreDescending([
          ...selectedRoutingSources,
          ...globalRoutingSources.filter((source) =>
            sourceIncludesContext(source, selectedModuleId),
          ),
        ]),
        matchCount,
        salaryQuestion,
      );
      const selectedRoot = resolveSelectedRootModule(sources, selectedModuleId);
      return {
        kind: 'evidence',
        resolvedModule: selectedRoot ?? {
          id: selectedModuleId,
          name: 'Módulo seleccionado',
        },
        sources,
        topRelevanceScore: topScore(sources),
      };
    }

    if (
      currentRoute?.kind === 'resolved' &&
      currentRoute.resolvedModule?.id === selectedModuleId
    ) {
      const sources = relevantSources(
        globalRoutingSources,
        matchCount,
        salaryQuestion,
      );
      return {
        kind: 'evidence',
        resolvedModule: currentRoute.resolvedModule,
        sources,
        topRelevanceScore: topScore(sources),
      };
    }

    if (globalRoutingSources.length) {
      const sources = relevantSources(
        globalRoutingSources,
        matchCount,
        salaryQuestion,
      );
      return {
        kind: 'ambiguous',
        modules: currentRoute?.modules ?? [],
        sources,
        topRelevanceScore: topScore(sources),
      };
    }

    return { kind: 'no_evidence', topRelevanceScore: null };
  }
}
