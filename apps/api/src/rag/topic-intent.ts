import type { RetrievedChunk } from './retrieval.gateway';
import {
  isDisciplinaryQuestion,
  isMedicalLeaveQuestion,
  isDirectAdministrativeEvidence,
} from './administrative-retrieval';
import {
  isDirectAuxiliaryEvidence,
  isAuxiliaryRequirementsQuestion,
} from './auxiliary-retrieval';
import {
  isCareerProgressionQuestion,
  isDirectEvaluationEvidence,
} from './evaluation-retrieval';
import {
  isDirectReassignmentEvidence,
  isReassignmentQuestion,
  reassignmentRole,
} from './reassignment-retrieval';
import {
  isDirectRationalizationEvidence,
  isRationalizationQuestion,
} from './rationalization-retrieval';
import {
  isDirectTeachingPositionEvidence,
  isHoursDistributionQuestion,
  isPositionClassifierQuestion,
  isPositionConditionQuestion,
} from './teaching-position-retrieval';
import {
  isDirectRemunerationEvidence,
  isRuralAllocationQuestion,
} from './remuneration-retrieval';
import { normalizeSpanishText } from './text-normalization';
import type { MedicalLeaveApplicability } from './medical-leave-applicability';

/**
 * Intención temática principal de una consulta en el chat general. No decide el
 * carril social ni sustituye la recuperación: identifica el proceso que la
 * persona pide para que (a) la búsqueda no se reparta entre módulos por parecido
 * de palabras y (b) la falta de documentos se explique por tema, no con una
 * aclaración genérica ni con una lista de módulos alternativos.
 *
 * Cada intención se reconoce por una combinación de conceptos, no por una
 * palabra suelta. Las etiquetas solo describen el tema consultado; no afirman
 * requisitos, plazos ni montos.
 */

export type TopicIntentId =
  | 'reassignment'
  | 'medical-leave'
  | 'career-progression'
  | 'rural-allocation'
  | 'auxiliary-requirements'
  | 'disciplinary'
  | 'rationalization'
  | 'teaching-hours'
  | 'position-condition'
  | 'position-classifier';

export interface TopicIntent {
  id: TopicIntentId;
  /** Etiqueta para explicar el tema identificado (con artículo). */
  label: string;
  /** Módulo del catálogo que trata el tema. */
  moduleName: string;
}

const INTENTS: Record<TopicIntentId, TopicIntent> = {
  reassignment: {
    id: 'reassignment',
    label: 'la reasignación docente',
    moduleName: 'Contratación y desplazamientos',
  },
  'medical-leave': {
    id: 'medical-leave',
    label: 'la licencia por incapacidad temporal (descanso médico)',
    moduleName: 'Situaciones Administrativas',
  },
  'career-progression': {
    id: 'career-progression',
    label: 'el ascenso de escala magisterial',
    moduleName: 'Evaluación docente',
  },
  'rural-allocation': {
    id: 'rural-allocation',
    label: 'la asignación por trabajar en una institución educativa rural',
    moduleName: 'Remuneraciones',
  },
  'auxiliary-requirements': {
    id: 'auxiliary-requirements',
    label: 'los requisitos para trabajar como auxiliar de educación',
    moduleName: 'Auxiliar de educación',
  },
  disciplinary: {
    id: 'disciplinary',
    label:
      'el procedimiento administrativo disciplinario y el derecho de defensa',
    moduleName: 'Situaciones Administrativas',
  },
  rationalization: {
    id: 'rationalization',
    label: 'la racionalización de plazas',
    moduleName: 'Cargos y plazas',
  },
  'teaching-hours': {
    id: 'teaching-hours',
    label:
      'el cuadro de distribución de horas y la asignación de la carga horaria docente',
    moduleName: 'Cargos y plazas',
  },
  'position-condition': {
    id: 'position-condition',
    label: 'la condición de la plaza (orgánica, eventual o excedente)',
    moduleName: 'Cargos y plazas',
  },
  'position-classifier': {
    id: 'position-classifier',
    label: 'el clasificador de cargos',
    moduleName: 'Cargos y plazas',
  },
};

export function medicalLeaveTopicIntent(
  applicability: MedicalLeaveApplicability,
): TopicIntent {
  const intent = INTENTS['medical-leave'];
  return applicability.regime === 'auxiliar'
    ? { ...intent, moduleName: 'Auxiliar de educación' }
    : intent;
}

/**
 * Consultas cuya intención principal es el efecto económico, no el
 * procedimiento. No se dejan llevar por una palabra del proceso: la respuesta
 * salarial existente ya combina la norma con la tabla y las condiciones. La
 * asignación por ruralidad es la excepción: el «pago adicional» es el propio
 * beneficio que se consulta.
 */
const SALARY_CONSEQUENCE =
  /\b(?:remuner\p{L}*|sueld\p{L}*|salari\p{L}*|haber(?:es)?|ingres\p{L}*|pag\p{L}*|cobr\p{L}*|percib\p{L}*|descuent\p{L}*|mont\p{L}*|aument\p{L}*|bonif\p{L}*|cuanto\s+(?:gana|ganan|gano|ganaria)|gan(?:a|an|o|aria)|me\s+corresponde)\b/u;

/**
 * Orden deliberado: primero las intenciones con señales más específicas. Una
 * consulta disciplinaria puede mencionar «evaluación»; una de reasignación puede
 * mencionar una enfermedad como causal. El proceso nombrado manda.
 */
export function detectTopicIntent(question: string): TopicIntent | null {
  const text = normalizeSpanishText(question);
  if (SALARY_CONSEQUENCE.test(text) && !isRuralAllocationQuestion(question)) {
    return null;
  }
  if (isDisciplinaryQuestion(question)) return INTENTS.disciplinary;
  if (isReassignmentQuestion(question)) {
    // El auxiliar tiene su propio procedimiento de reasignación; la etiqueta y
    // el módulo deben decirlo para no atribuirle la norma de profesores.
    const role = reassignmentRole(question);
    if (role === 'auxiliar') {
      return {
        ...INTENTS.reassignment,
        label: 'la reasignación de auxiliares de educación',
        moduleName: 'Auxiliar de educación',
      };
    }
    if (role === null) {
      return { ...INTENTS.reassignment, label: 'la reasignación' };
    }
    return INTENTS.reassignment;
  }
  if (isCareerProgressionQuestion(question)) {
    return INTENTS['career-progression'];
  }
  if (isMedicalLeaveQuestion(question)) return INTENTS['medical-leave'];
  if (isRuralAllocationQuestion(question)) return INTENTS['rural-allocation'];
  if (isAuxiliaryRequirementsQuestion(question)) {
    return INTENTS['auxiliary-requirements'];
  }
  if (isRationalizationQuestion(question)) return INTENTS.rationalization;
  // El resto del módulo «Cargos y plazas»: la reducción por matrícula ya se
  // resolvió arriba porque es la lectura más específica de «plaza». Aquí quedan
  // la distribución de horas, la condición de la plaza y el clasificador.
  if (isHoursDistributionQuestion(question)) return INTENTS['teaching-hours'];
  if (isPositionConditionQuestion(question)) {
    return INTENTS['position-condition'];
  }
  if (isPositionClassifierQuestion(question)) {
    return INTENTS['position-classifier'];
  }
  return null;
}

/**
 * Evidencia que trata directamente la intención identificada. Se usa para
 * separar la documentación del tema de las coincidencias de vocabulario
 * laboral: la lista de módulos alternativos no debe nacer de esas coincidencias.
 * El fragmento se pasa completo para que una intención pueda exigir además la
 * asociación de la fuente a su módulo.
 */
export function isTopicIntentEvidence(
  intent: TopicIntent,
  question: string,
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'> & {
    moduleNames?: readonly string[];
    sectionTitle?: string | null;
  },
): boolean {
  switch (intent.id) {
    case 'reassignment':
      return isDirectReassignmentEvidence(question, source);
    case 'medical-leave':
    case 'disciplinary':
      return isDirectAdministrativeEvidence(question, source);
    case 'career-progression':
      return isDirectEvaluationEvidence(question, source);
    case 'rural-allocation':
      return isDirectRemunerationEvidence(question, source);
    case 'auxiliary-requirements':
      return isDirectAuxiliaryEvidence(question, source);
    case 'rationalization':
      return isDirectRationalizationEvidence(question, source);
    case 'teaching-hours':
    case 'position-condition':
    case 'position-classifier':
      return isDirectTeachingPositionEvidence(question, source);
  }
}
