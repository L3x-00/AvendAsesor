import { createHash } from 'node:crypto';
import annotations from './evidence/medical-leave.json';
import type { RetrievedChunk } from './retrieval.gateway';
import type {
  MedicalIntent,
  MedicalLeaveApplicability,
  MedicalRegime,
} from './medical-leave-applicability';

interface Excerpt {
  kind: 'excerpt';
  chunkId: string;
  start: number;
  end: number;
  reference: string;
}
type EvidenceNode =
  | Excerpt
  | { kind: 'when'; condition: Excerpt; children: EvidenceNode[] }
  | { kind: 'sequence'; children: Excerpt[] }
  | { kind: 'allOf' | 'anyOf' | 'conditional'; children: EvidenceNode[] };
interface ReviewedEvidence {
  label: string;
  scope: MedicalRegime;
  versionId: string;
  required: {
    chunkId: string;
    chunkIndex: number;
    sha256: string;
    pageStart: number;
    pageEnd: number;
  }[];
  nodes: EvidenceNode[];
  /** The provisions that answer each request; their dependencies are included below. */
  intents: Record<Exclude<MedicalIntent, 'unsupported'>, string[]>;
  dependencies: Partial<Record<string, string[]>>;
}

// These are reviewed documentary relationships, not rules inferred from a
// phrase or from an LLM verdict. The complete surrounding chunks are checked;
// an unchanged isolated quote cannot authorize an out-of-date annotation.
const reviewed = annotations as ReviewedEvidence[];

function applicableItems(applicability: MedicalLeaveApplicability) {
  if (
    applicability.intent === 'unsupported' ||
    (applicability.regime === null) !==
      (applicability.confirmation === 'unresolved')
  )
    return [];
  return reviewed.filter(
    (item) =>
      !applicability.excludedRegimes.includes(item.scope) &&
      (applicability.regime === null || applicability.regime === item.scope),
  );
}

export function medicalLeaveContextRequests(
  sources: readonly RetrievedChunk[],
  applicability: MedicalLeaveApplicability,
) {
  return applicableItems(applicability).flatMap((item) =>
    sources.some(
      (source) =>
        source.documentVersionId === item.versionId &&
        source.documentSituation === 'current',
    )
      ? [
          {
            versionId: item.versionId,
            chunkIds: item.required.map((c) => c.chunkId),
          },
        ]
      : [],
  );
}

function nodeReference(node: EvidenceNode): string {
  if (node.kind === 'excerpt') return node.reference;
  if (node.kind === 'when') return node.condition.reference;
  return nodeReference(node.children[0]);
}

function excerpts(node: EvidenceNode): Excerpt[] {
  if (node.kind === 'excerpt') return [node];
  const children = node.children.flatMap(excerpts);
  return node.kind === 'when' ? [node.condition, ...children] : children;
}

export function validatedMedicalLeaveEvidence(
  applicability: MedicalLeaveApplicability,
  sources: readonly RetrievedChunk[],
) {
  const intent = applicability.intent;
  if (intent === 'unsupported') return [];
  return applicableItems(applicability).flatMap((item) => {
    const selected = item.required.map((required) =>
      sources.find(
        (source) =>
          source.chunkId === required.chunkId &&
          source.documentVersionId === item.versionId &&
          source.documentSituation === 'current' &&
          source.chunkIndex === required.chunkIndex &&
          source.pageStart === required.pageStart &&
          source.pageEnd === required.pageEnd &&
          createHash('sha256').update(source.chunkContent).digest('hex') ===
            required.sha256,
      ),
    );
    if (!selected.every((source) => source !== undefined)) return [];
    const references = new Set(item.intents[intent]);
    // Set iteration includes appended entries, computing the transitive closure
    // without making selection depend on ranking or a generated paraphrase.
    for (const reference of references) {
      for (const dependency of item.dependencies[reference] ?? [])
        references.add(dependency);
    }
    const nodes = [...references].map((reference) =>
      item.nodes.find((node) => nodeReference(node) === reference),
    );
    if (!nodes.length || !nodes.every((node) => node !== undefined)) return [];
    const spans = nodes.flatMap(excerpts);
    if (
      spans.some((span) => {
        const source = selected.find((entry) => entry.chunkId === span.chunkId);
        return (
          !source ||
          span.start < 0 ||
          span.end > source.chunkContent.length ||
          span.end <= span.start
        );
      })
    )
      return [];
    return [
      {
        scope: item.scope,
        label: item.label,
        nodes,
        context: selected,
        cited: selected.filter((source) =>
          spans.some((span) => span.chunkId === source.chunkId),
        ),
      },
    ];
  });
}

export function renderMedicalLeaveAnswer(
  applicability: MedicalLeaveApplicability,
  complete: ReturnType<typeof validatedMedicalLeaveEvidence>,
): { answer: string; sources: RetrievedChunk[] } | null {
  if (!complete.length) return null;
  const selectedSources = complete.flatMap((entry) => entry.cited);
  const rank = new Map(
    selectedSources.map((source, i) => [source.chunkId, i + 1]),
  );
  const textOf = (node: Excerpt): string => {
    const source = selectedSources.find(
      (source) => source.chunkId === node.chunkId,
    );
    return source!.chunkContent
      .slice(node.start, node.end)
      .replace(/\s+/gu, ' ')
      .trim();
  };
  const citation = (node: Excerpt) => `[${rank.get(node.chunkId)}]`;
  const quote = (node: Excerpt): string =>
    `**${node.reference}**: «${textOf(node)}» ${citation(node)}`;
  const render = (node: EvidenceNode): string => {
    if (node.kind === 'excerpt') return quote(node);
    if (node.kind === 'sequence')
      return `**${nodeReference(node)}**: «${node.children.map(textOf).join(' ')}» ${[...new Set(node.children.map(citation))].join(' ')}`;
    if (node.kind === 'when')
      return `${quote(node.condition)}\n\n${node.children.map(render).join('\n\n')}`;
    const label = {
      anyOf:
        'Documentos alternativos: corresponde una de estas vías, no ambas acumuladas.',
      allOf: 'Documentos y condiciones conjuntos dentro de esta alternativa:',
      conditional:
        'Supuesto condicionado: aplica únicamente en el caso que describe el texto.',
    }[node.kind];
    return `${label}\n\n${node.children.map(render).join('\n\n')}`;
  };
  const sections = complete.map(
    ({ label, nodes }) =>
      `### ${applicability.regime === null ? 'Si el descanso corresponde a ' : ''}${label.toLocaleLowerCase('es')}\n\n${nodes.map(render).join('\n\n')}`,
  );
  const heading = {
    procedure: 'Cómo tramitar el descanso médico',
    eligibility: 'Cuándo se puede solicitar el descanso médico',
    documents: 'Qué documentos sustentan la licencia',
    deadline: 'Plazo para presentar la solicitud',
    resolution_deadline: 'Plazo para resolver la solicitud',
    forwarding_deadline: 'Plazo para remitir la solicitud',
    citt_deadline: 'Cuándo se presenta el CITT',
    hospitalization:
      'Cómo tramitar la licencia durante o después de la hospitalización',
    unsupported: '',
  }[applicability.intent];
  return {
    answer:
      `## ${heading}\n\nPara aplicar este procedimiento, confirma que la persona consultada está comprendida en el ámbito de la norma citada.\n\n` +
      sections.join('\n\n') +
      (applicability.regime === null
        ? '\n\n¿El descanso es de un profesor o de un auxiliar de educación? Con ese dato puedo indicar cuál de estas reglas corresponde a la consulta.'
        : ''),
    sources: selectedSources,
  };
}
