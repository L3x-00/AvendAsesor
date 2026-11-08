import { createHash } from 'node:crypto';
import {
  isAuxiliaryHiringDocumentsFollowUp,
  isAuxiliaryRequirementsQuestion,
} from './auxiliary-retrieval';
import manifests from './evidence/reviewed-administrative.json';
import {
  isReassignmentQuestion,
  reassignmentRole,
} from './reassignment-retrieval';
import type { RetrievedChunk } from './retrieval.gateway';
import { temporaryPlacementQueries } from './temporary-placement-retrieval';
import { normalizeSpanishText } from './text-normalization';

interface Span {
  heading: string;
  chunkId: string;
  start: number;
  end: number;
  branch?: string;
}

type Intent = keyof typeof manifests;
interface Request {
  intent: Intent;
  branches: readonly string[];
}

const FAQ_CAMPAIGN_YEAR = '2026';

function isReviewedCampaign(question: string): boolean {
  const years = question.match(/\b(?:19|20)\d{2}\b/gu);
  return years
    ? years.every((year) => year === FAQ_CAMPAIGN_YEAR)
    : String(new Date().getUTCFullYear()) === FAQ_CAMPAIGN_YEAR;
}

function isTeacherRenewalOverview(text: string): boolean {
  const subject = text.replace(
    /^¿?\s*(?:como (?:se renueva|renuevo|renovar)|(?:cuales son (?:las )?)?condiciones para (?:la )?renovacion de|(?:cuales son (?:los )?)?requisitos para renovar)\s+/u,
    '',
  );
  return (
    subject !== text &&
    /^(?:(?:el|mi|un)\s+)?contrato\s+(?:de\s+(?:(?:un[ao]?|el|la)\s+)?)?(?:docentes?|profesor(?:a|es|as)?)(?:\s+(?:para|en)\s+(?:el\s+)?20\d{2})?\s*[?.!]*$/u.test(
      subject,
    )
  );
}

function requestFor(question: string, prior?: string): Request | null {
  const text = normalizeSpanishText(question);
  const auxiliary = /\bauxiliar(?:es)?\b/u.test(text);
  if (
    /\b(?:compara|comparar|diferencia(?:s)? entre|en lugar de|en vez de)\b/u.test(
      text,
    ) ||
    /\bno\s+(?:(?:quiero|deseo|busco|solicito)\s+)?(?:por\s+|(?:un[ao]?|el|la)\s+)?(?:permut\p{L}*|destaque|unidad familiar|necesidad institucional|salud)\b/u.test(
      text,
    )
  )
    return null;

  const previous = normalizeSpanishText(prior ?? '');
  if (isReviewedCampaign(`${text} ${previous}`)) {
    if (isAuxiliaryHiringDocumentsFollowUp(question, prior)) {
      return { intent: 'auxiliary-hiring-documents', branches: [] };
    }
    if (
      isTeacherRenewalOverview(previous) &&
      /\brenovacion\b/u.test(text) &&
      /\bdesempeno\b/u.test(text) &&
      /\b(?:que se evalua|factores|criterios|aspectos)\b/u.test(text) &&
      !/\b(?:etp|tecnico productiva|cetpro|pronoei|crebe|encargatura|puntaje|reclamo|plazo|si|sin)\b/u.test(
        text,
      )
    )
      return { intent: 'teacher-renewal-evaluation', branches: [] };
  }
  if (isReviewedCampaign(text) && isTeacherRenewalOverview(text)) {
    return { intent: 'teacher-renewal', branches: [] };
  }

  if (
    /\bauxiliar(?:es)?\s+(?:de\s+(?:educacion|inicial)|en\s+inicial)\b/u.test(
      text,
    ) &&
    isAuxiliaryRequirementsQuestion(question) &&
    /\binicial\b/u.test(text) &&
    /\b(?:estudios?|formacion|capacitacion|titulo|ciclos?)\b/u.test(text) &&
    !/\bno\s+(?:quiero|voy a)\s+postular\b/u.test(text) &&
    isReviewedCampaign(text)
  ) {
    const modality = text.replace(
      /\bno\s+(?:(?:en|de|para)\s+)?(?:la\s+)?(?:ebr|ebe|basica regular|basica especial)\b/gu,
      ' ',
    );
    const regular = /\b(?:ebr|basica regular)\b/u.test(modality);
    const special = /\b(?:ebe|basica especial)\b/u.test(modality);
    if (modality !== text && !regular && !special) return null;
    return {
      intent: 'initial-auxiliary-studies',
      branches: [
        ...(!special || regular ? ['regular'] : []),
        ...(!regular || special ? ['special'] : []),
      ],
    };
  }
  if (
    auxiliary &&
    /\b(?:auxiliar(?:es)? de educacion|auxiliar(?:es)? nombrad[oa]s?)\b/u.test(
      text,
    ) &&
    /\bpermuta(?:r)?\b|\bintercambiar\s+(?:mi|la|su|una)\s+plaza\b/u.test(
      text,
    ) &&
    !/\b(?:reasignacion|licencias?|profesor(?:a|es)?|docentes?|contratad[oa]s?)\b/u.test(
      text,
    )
  )
    return { intent: 'auxiliary-exchange', branches: [] };

  if (
    !auxiliary &&
    /\b(?:cuando|en que casos|por que (?:motivos?|causas?|faltas?)|causales? de)\b/u.test(
      text,
    ) &&
    /\b(?:destitucion|destituir(?:me|lo|la)?|destituid[oa])\b/u.test(text) &&
    /\b(?:docentes?|profesor(?:a|es|as)?)\b/u.test(text) &&
    !/\b(?:descargos?|apelacion|apelar|defender(?:me|se)|recursos?|si|mi caso|por (?!que\b|una falta\b|faltas?\b)\p{L}+)\b/u.test(
      text,
    )
  )
    return { intent: 'teacher-dismissal', branches: [] };

  const spouse = /\b(?:espos[oa]|conyuge|matrimonio)\b/u.test(text);
  if (
    reassignmentRole(question) === 'docente' &&
    isReassignmentQuestion(question) &&
    (spouse || /\bunidad familiar\b/u.test(text)) &&
    !/\b(?:permuta(?:r)?|interes personal|por salud|cronograma|fechas?|public\p{L}*|(?:madre|padre|hij[oa]s?|conviviente))\b/u.test(
      text,
    )
  )
    return {
      intent: 'family-reassignment',
      branches: spouse ? ['spouse'] : [],
    };

  if (
    !auxiliary &&
    isReviewedCampaign(text) &&
    !/\b(?:contratad[oa]s?|fechas?|cronograma|cuando|renov\p{L}*|prorrog\p{L}*|reasign\p{L}*|termin\p{L}*|desist\p{L}*)\b/u.test(
      text,
    ) &&
    ((/\bdestaque\b/u.test(text) &&
      /\b(?:que es|como (?:solicito|pido|tramito)|requisitos|tramite|cuanto dura|plazo)\b/u.test(
        text,
      )) ||
      temporaryPlacementQueries(question).length > 0)
  ) {
    const institutional = /\bnecesidad institucional\b/u.test(text);
    const family = /\bunidad familiar\b/u.test(text);
    const health = /\b(?:por|causal de) salud\b/u.test(text);
    const unspecified = !institutional && !family && !health;
    return {
      intent: 'temporary-placement',
      branches: [
        ...(institutional || unspecified ? ['institutional'] : []),
        ...(family || unspecified ? ['family'] : []),
        ...(health || unspecified ? ['health'] : []),
        ...(family || health || unspecified ? ['family-or-health'] : []),
      ],
    };
  }
  return null;
}

function reviewedRequest(
  question: string,
  sources: readonly RetrievedChunk[],
  prior?: string,
) {
  const request = requestFor(question, prior);
  if (!request) return null;
  const manifest = manifests[request.intent];
  const anchor = sources.find(
    (source) =>
      source.documentVersionId === manifest.versionId &&
      source.documentId === manifest.documentId &&
      source.documentSituation === 'current',
  );
  return anchor ? { request, manifest, anchor } : null;
}

export function reviewedAdministrativeContext(
  question: string,
  sources: readonly RetrievedChunk[],
  prior?: string,
) {
  const selected = reviewedRequest(question, sources, prior);
  if (!selected) return null;
  const { anchor, manifest } = selected;
  return {
    anchor,
    versionId: manifest.versionId,
    chunkIds: manifest.required.map((chunk) => chunk.chunkId),
  };
}

/** Each passage retains the source and the conditions reviewed with that passage. */
export function reviewedAdministrativeAnswer(
  question: string,
  sources: readonly RetrievedChunk[],
  prior?: string,
) {
  const selected = reviewedRequest(question, sources, prior);
  if (!selected) return null;
  const { request, manifest } = selected;
  const validated = new Map<string, RetrievedChunk>();
  for (const required of manifest.required) {
    const source = sources.find(
      (chunk) =>
        chunk.chunkId === required.chunkId &&
        chunk.documentVersionId === manifest.versionId &&
        chunk.documentId === manifest.documentId &&
        chunk.documentSituation === 'current' &&
        chunk.chunkIndex === required.chunkIndex &&
        chunk.pageStart === required.pageStart &&
        chunk.pageEnd === required.pageEnd &&
        createHash('sha256').update(chunk.chunkContent).digest('hex') ===
          required.sha256,
    );
    if (!source) return null;
    validated.set(source.chunkId, source);
  }

  const sections: string[] = [];
  const cited: RetrievedChunk[] = [];
  const spans: Span[] = manifest.spans;
  for (const span of spans) {
    if (span.branch && !request.branches.includes(span.branch)) continue;
    const source = validated.get(span.chunkId);
    if (
      !source ||
      span.start < 0 ||
      span.end <= span.start ||
      span.end > source.chunkContent.length
    )
      return null;
    const excerpt = source.chunkContent
      .slice(span.start, span.end)
      .replace(/\n+NORMA TÉCNICA [^\n]+? Página \d+ de \d+\s+/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim();
    let rank = cited.indexOf(source) + 1;
    if (!rank) rank = cited.push(source);
    sections.push(`**${span.heading}**\n\n${excerpt} [${rank}]`);
  }
  return sections.length
    ? { answer: sections.join('\n\n'), sources: cited }
    : null;
}
