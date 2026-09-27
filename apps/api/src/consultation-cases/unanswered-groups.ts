import {
  buildVocabulary,
  correctDomainTypos,
  matchTopicModule,
  type TopicModule,
} from '../chat/catalog/topic-match';
import { classifyTurnIntent } from '../chat/intent/intent-classifier';
import type { ConsultationCaseSummary } from './consultation-cases.gateway';

/**
 * Consultas sin sustento agrupadas por tema, para que la administración vea
 * qué documentación falta («6 consultas sobre Remuneraciones») en vez de
 * revisar caso por caso. El tema sale de la ruta detectada, del tema elegido
 * por el docente o, si no hay ninguno, de las palabras de la consulta
 * (tolerando errores de escritura).
 */
export interface UnansweredGroup {
  /** Casos abiertos del grupo (para resolverlos juntos). */
  caseIds: string[];
  count: number;
  /** Hasta 3 consultas distintas, como ejemplo del grupo. */
  examples: string[];
  /**
   * `catalog`: preguntas sobre qué documentos hay; el asistente ya las
   * responde con el catálogo, así que se pueden cerrar sin cargar nada.
   */
  kind: 'catalog' | 'topic' | 'unknown';
  latestAt: string;
  /** Tema donde conviene cargar el documento (submódulo si se conoce). */
  moduleId: string | null;
  moduleName: string | null;
  parentModuleName: string | null;
}

const MAX_EXAMPLES = 3;
const MAX_EXAMPLE_CHARS = 160;
const MAX_CASE_IDS = 50;

function example(question: string): string {
  const clean = question.replace(/\s+/gu, ' ').trim();
  return clean.length <= MAX_EXAMPLE_CHARS
    ? clean
    : `${clean.slice(0, MAX_EXAMPLE_CHARS - 1).trimEnd()}…`;
}

export function groupUnansweredCases(
  cases: ConsultationCaseSummary[],
  modules: TopicModule[],
): UnansweredGroup[] {
  const vocabulary = buildVocabulary(modules.map((module) => module.name));
  const byId = new Map(modules.map((module) => [module.id, module]));
  const groups = new Map<string, UnansweredGroup>();

  for (const item of cases) {
    const question = item.questionSnapshot ?? '';
    let kind: UnansweredGroup['kind'] = 'unknown';
    let module: TopicModule | null = null;

    const intent = question ? classifyTurnIntent(question) : null;
    if (intent?.lane === 'social' && intent.subtype === 'catalog') {
      kind = 'catalog';
    } else {
      const detectedId = item.detectedSubmoduleId ?? item.detectedModuleId;
      const fromWords = question
        ? // Para agrupar basta con que la consulta nombre el tema.
          matchTopicModule(correctDomainTypos(question, vocabulary), modules, {
            requireTopicCoverage: false,
          })
        : null;
      // Orden: la ruta detectada por el RAG; si no hubo, las palabras de la
      // consulta; y por último el tema que estaba abierto en pantalla (el
      // docente pudo estar en otro módulo).
      module =
        (detectedId ? byId.get(detectedId) : undefined) ??
        fromWords ??
        (item.requestedModuleId ? byId.get(item.requestedModuleId) : null) ??
        null;
      if (module) kind = 'topic';
    }

    const key = kind === 'topic' && module ? `topic:${module.id}` : kind;
    const parent = module?.parentModuleId
      ? (byId.get(module.parentModuleId) ?? null)
      : null;
    const group = groups.get(key) ?? {
      caseIds: [],
      count: 0,
      examples: [],
      kind,
      latestAt: item.createdAt,
      moduleId: module?.id ?? null,
      moduleName: module?.name ?? null,
      parentModuleName: parent?.name ?? null,
    };
    group.count += 1;
    if (group.caseIds.length < MAX_CASE_IDS) group.caseIds.push(item.id);
    if (item.createdAt > group.latestAt) group.latestAt = item.createdAt;
    const text = question ? example(question) : null;
    if (
      text &&
      group.examples.length < MAX_EXAMPLES &&
      !group.examples.some(
        (existing) => existing.toLowerCase() === text.toLowerCase(),
      )
    ) {
      group.examples.push(text);
    }
    groups.set(key, group);
  }

  const order = { topic: 0, unknown: 1, catalog: 2 } as const;
  return [...groups.values()].sort(
    (left, right) =>
      order[left.kind] - order[right.kind] ||
      right.count - left.count ||
      right.latestAt.localeCompare(left.latestAt),
  );
}
