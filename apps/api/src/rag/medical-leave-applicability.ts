import { normalizeSpanishText } from './text-normalization';

export type MedicalRegime = 'docente' | 'auxiliar';
export type MedicalIntent =
  | 'procedure'
  | 'documents'
  | 'deadline'
  | 'resolution_deadline'
  | 'forwarding_deadline'
  | 'citt_deadline'
  | 'hospitalization'
  | 'eligibility'
  | 'unsupported';

export interface MedicalLeaveApplicability {
  subject: 'self' | 'third_party' | 'unspecified';
  regime: MedicalRegime | null;
  confirmation: 'explicit' | 'inherited' | 'unresolved';
  /** Position in the user-turn sequence; assistant text cannot supply it. */
  subjectTurn: number | null;
  regimeTurn: number | null;
  excludedRegimes: readonly MedicalRegime[];
  intent: MedicalIntent;
}

type Clause = { words: string[]; text: string; interrogative: boolean };
const roles = new Map<string, MedicalRegime>([
  ['profesor', 'docente'],
  ['profesora', 'docente'],
  ['docente', 'docente'],
  ['auxiliar', 'auxiliar'],
]);
const articles = new Set(['un', 'una', 'el', 'la']);
const link = new Set(['nombrado', 'nombrada', 'contratado', 'contratada']);

function roleAt(words: readonly string[], offset: number) {
  let end = offset;
  if (articles.has(words[end])) end++;
  const regime = roles.get(words[end++]);
  if (!regime) return null;
  if (words[end] === 'de') {
    if (words[end + 1] !== 'educacion') return null;
    end += 2;
  }
  if (link.has(words[end])) end++;
  return { regime, end };
}

function clauses(text: string): Clause[] {
  const segments = text.split(/([¿?¡!.,;]|\bpero\b|\by\b)/u);
  let openQuestion = false;
  return segments.flatMap((segment, i) => {
    if (segment === '¿') {
      openQuestion = true;
      return [];
    }
    if (segment === '?') {
      openQuestion = false;
      return [];
    }
    const value = segment.trim();
    if (!value || /^[¡!.,;]$|^(?:pero|y)$/u.test(value)) return [];
    const words = value.split(/\s+/u);
    return [
      {
        words,
        text: value,
        interrogative:
          openQuestion ||
          segments[i + 1] === '?' ||
          ['que', 'como', 'cual', 'cuanto', 'cuando', 'donde'].includes(
            words[0],
          ),
      },
    ];
  });
}

function declarations(
  clause: Clause,
): { regime: MedicalRegime; negative: boolean }[] {
  if (clause.interrogative) return [];
  const { words } = clause;
  let at = 0;
  if (words[at] === 'yo') at++;
  const negative = words[at] === 'no';
  if (negative) at++;
  if (words[at++] !== 'soy') return [];
  const role = roleAt(words, at);
  if (!role) return [];
  if (role.end === words.length) return [{ regime: role.regime, negative }];
  if (negative && words[role.end] === 'sino') {
    const corrected = roleAt(
      words,
      role.end + (words[role.end + 1] === 'soy' ? 2 : 1),
    );
    if (corrected?.end === words.length)
      return [
        { regime: role.regime, negative: true },
        { regime: corrected.regime, negative: false },
      ];
  }
  return [];
}

function beneficiaryComplement(words: readonly string[]): number {
  return words.findIndex(
    (word, i) =>
      (word === 'de' || word === 'para') &&
      ((words[i - 2] === 'descanso' && words[i - 1] === 'medico') ||
        words[i - 1] === 'licencia' ||
        words[i - 1] === 'es') &&
      (articles.has(words[i + 1]) ||
        ['mi', 'su', 'ella', 'ellos', 'ellas'].includes(words[i + 1])),
  );
}

function target({ words }: Clause): MedicalRegime | null {
  if (words[0] === 'no') return null;
  const of = beneficiaryComplement(words);
  if (of >= 0) {
    if (words[of - 1] === 'es' && words[of - 2] === 'no') return null;
    const owner = roleAt(words, of + 1);
    // A qualifier we cannot interpret (e.g. «jubilado») cannot authorize the
    // named regime. The complement still proves a different beneficiary.
    return owner && (owner.end === words.length || words[owner.end] === 'con')
      ? owner.regime
      : null;
  }
  // A target frame binds the person consulted, not the speaker's occupation.
  const explicit =
    words[0] === 'pregunto' && ['por', 'sobre', 'si'].includes(words[1]);
  const at = explicit ? 2 : 0;
  if (!articles.has(words[at])) return null;
  const role = roleAt(words, at);
  if (!role) return null;
  const predicate = words[role.end];
  if (explicit && (!predicate || predicate === 'con')) return role.regime;
  return ['hospitalizado', 'hospitalizada'].includes(predicate) ||
    (predicate === 'tiene' &&
      ['descanso', 'incapacidad', 'licencia'].includes(words[role.end + 1]))
    ? role.regime
    : null;
}

const selfBeneficiary =
  /\b(?:me\s+(?:dieron|dio\s+descanso|enferme|recetaron|hospitalizaron)|mi\s+(?:licencia|descanso)|tengo\s+(?:un\s+)?descanso\s+medico|estoy\s+hospitalizad[oa])\b/u;
const selfRequest =
  /\b(?:puedo\s+(?:pedir|solicitar)|necesito\s+licencia|tengo\s+derecho|(?:pido|presento|adjunto))\b/u;
const personalRequest =
  /\b(?:necesito\s+licencia|puedo\s+(?:pedir|solicitar)\s+(?:un\s+|una\s+|mi\s+)?(?:descanso|licencia)|tengo\s+derecho\s+a)\b/u;
const nonPersons = new Set([
  'licencia',
  'descanso',
  'certificado',
  'citt',
  'solicitud',
  'contrato',
  'plazo',
]);

function mentionsAnotherBeneficiary({ words, text }: Clause): boolean {
  if (beneficiaryComplement(words) >= 0) return true;
  if (
    /\b(?:su\s+(?:licencia|descanso)|le\s+dieron|pregunto\s+(?:por|sobre|si))\b/u.test(
      text,
    )
  )
    return true;
  return words.some((word, i) => {
    if (
      !['mi', 'su', 'nuestro', 'nuestra'].includes(word) ||
      !words[i + 1] ||
      nonPersons.has(words[i + 1])
    )
      return false;
    // A person named before a medical statement may be its beneficiary,
    // regardless of the wording of the predicate.
    return (
      (i === 0 &&
        /\b(?:descanso|licencia|incapacidad|enferm\w*|hospitaliz\w*)\b/u.test(
          text,
        )) ||
      ['para', 'por', 'a'].includes(words[i - 1])
    );
  });
}

interface BeneficiaryBinding extends Pick<
  MedicalLeaveApplicability,
  'subject' | 'regime'
> {
  evidence: 'absent' | 'self' | 'other' | 'conflicting';
  excluded?: ReadonlySet<MedicalRegime>;
}

function bindBeneficiary(parts: Clause[]): BeneficiaryBinding {
  const unresolved = { subject: 'unspecified', regime: null } as const;
  if (parts.some((part) => /["'«»“”]/u.test(part.text)))
    return { ...unresolved, evidence: 'conflicting' };
  const declared = new Set<MedicalRegime>();
  const excluded = new Set<MedicalRegime>();
  const targets = new Set<MedicalRegime>();
  for (const part of parts) {
    for (const role of declarations(part)) {
      if (role.negative) {
        declared.delete(role.regime);
        excluded.add(role.regime);
      } else {
        declared.add(role.regime);
        excluded.delete(role.regime);
      }
    }
    const queried = target(part);
    if (queried) targets.add(queried);
  }
  const own = parts.some(
    (part) => !part.text.startsWith('no ') && selfBeneficiary.test(part.text),
  );
  const deniedOwn = parts.some(
    (part) =>
      (part.text.startsWith('no ') && selfBeneficiary.test(part.text)) ||
      /\bno\s+es\s+(?:mi\s+(?:descanso|licencia)|mi[oa])\b/u.test(part.text),
  );
  const other = parts.some(mentionsAnotherBeneficiary);
  if (targets.size > 1 || (own && (targets.size || other)))
    return { ...unresolved, evidence: 'conflicting' };
  if (targets.size === 1)
    return {
      subject: 'third_party',
      regime: [...targets][0],
      evidence: 'other',
    };
  if (other) return { subject: 'third_party', regime: null, evidence: 'other' };
  if (deniedOwn) return { ...unresolved, evidence: 'conflicting' };
  const self =
    own ||
    (parts.length > 0 &&
      parts.every((part) => declarations(part).length > 0)) ||
    parts.some((part) => personalRequest.test(part.text));
  return self
    ? {
        subject: 'self',
        regime: declared.size === 1 ? [...declared][0] : null,
        evidence: 'self',
        excluded,
      }
    : { ...unresolved, evidence: 'absent', excluded };
}

export function medicalSubjectIn(
  question: string,
): Pick<MedicalLeaveApplicability, 'subject' | 'regime'> {
  const { subject, regime } = bindBeneficiary(
    clauses(normalizeSpanishText(question)),
  );
  return { subject, regime };
}

const procedureRequest =
  /\bcomo\s+(?:present\w*|solicit\w*|pido|tramit\w*|justific\w*)\b|^que hago\b/u;

function isRequestClause(part: Clause): boolean {
  return (
    part.interrogative ||
    selfRequest.test(part.text) ||
    procedureRequest.test(part.text)
  );
}

/** Parse the requested object, keeping antecedents out of the intent. */
function requestIntent(part: Clause): MedicalIntent {
  const ask = part.text;
  // A purpose attached to the leave itself can name a different benefit.
  // An illness mentioned inside that purpose does not turn it into incapacity.
  if (/\blicencia para \p{L}+(?:ar|er|ir)(?:me|lo|la|los|las)?\b/u.test(ask))
    return 'unsupported';
  if (
    /^(?:(?:que|cual(?: es el)?|ese|el) plazos?|hasta cuando|cuantos? dias (?:tengo|hay|tiene) para)\b/u.test(
      ask,
    )
  ) {
    if (/\b(?:resuelv\w*|resolv\w*|emita\s+la\s+resolucion)\b/u.test(ask))
      return 'resolution_deadline';
    if (/\b(?:remit\w*|remision)\b/u.test(ask)) return 'forwarding_deadline';
    return /\bcitt\b/u.test(ask) ? 'citt_deadline' : 'deadline';
  }
  if (
    /^(?:(?:que|los) (?:documentos?|requisitos?)|(?:documentos|requisitos)$|que (?:debo )?(?:present\w*|adjunt\w*)|(?:puedo|debo) (?:presentar|adjuntar)|(?:esa|la) constancia)\b/u.test(
      ask,
    )
  )
    return 'documents';
  if (procedureRequest.test(ask)) {
    return /\b(?:documentos?|citt|certificado|receta)\b/u.test(ask)
      ? 'documents'
      : 'procedure';
  }
  if (
    /^(?:pued[oe] (?:pedir|solicitar) (?:(?:mi|la|el|una|un) )?(?:descanso|licencia)|(?:tengo|tiene) derecho (?:a )?(?:mi |la |el |una |un )?(?:descanso|licencia)|necesito licencia)\b/u.test(
      ask,
    )
  )
    return 'eligibility';
  if (
    /^(?:(?:si )?(?:estoy|esta) hospitalizad[oa]|(?:es|son) obligatori[oa]s? (?:la |el |los |las )?(?:constancia|receta|citt|certificado))\b/u.test(
      ask,
    )
  )
    return /hospitaliz|constancia/u.test(ask) ? 'hospitalization' : 'documents';
  if (
    /^(?:(?:en (?:ese descanso medico|esa licencia) )?(?:el citt|el certificado medico|la receta)(?: |$)|(?:el )?certificado (?:medico )?son alternativos)/u.test(
      ask,
    ) ||
    /^(?:ambos|los dos|es suficiente el citt)\b/u.test(ask)
  )
    return 'documents';
  return 'unsupported';
}

export function medicalIntentOf(question: string): MedicalIntent {
  const text = normalizeSpanishText(question);
  const parts = clauses(text);
  const requests = parts.filter(isRequestClause);
  const intents = (requests.length ? requests : parts)
    .map(requestIntent)
    .filter((intent) => intent !== 'unsupported');
  if (!intents.length) {
    if (!requests.length && /\bme dieron descanso medico\b/u.test(text))
      return 'procedure';
    return 'unsupported';
  }
  // The exceptional path needs a hospital scenario in the request or a
  // positive statement about the same beneficiary. An incidental mention
  // cannot replace the ordinary documentation rules.
  const hospitalScenario = requests.some(({ text }) =>
    /\b(?:si\s+(?:estoy|esta|estuve|estuvo)\s+hospitalizad[oa]|durante\s+la\s+hospitalizacion|tras\s+el\s+alta)\b/u.test(
      text,
    ),
  );
  const ownHospitalization =
    bindBeneficiary(parts).subject === 'self' &&
    parts.some(({ text }) =>
      /^(?:yo\s+)?(?:estoy|estuve|sigo|me\s+encuentro)\s+hospitalizad[oa]\b/u.test(
        text,
      ),
    );
  const distinct = new Set(intents);
  if (
    distinct.size === 1 &&
    (distinct.has('resolution_deadline') || distinct.has('forwarding_deadline'))
  )
    return intents[0];
  if (hospitalScenario || ownHospitalization || distinct.has('hospitalization'))
    return 'hospitalization';
  return distinct.size === 1 ? intents[0] : 'procedure';
}

export function medicalRequestConcernsAnotherTopic(question: string): boolean {
  const requests = clauses(normalizeSpanishText(question)).filter(
    isRequestClause,
  );
  return requests.some(({ text }) => {
    const object = text.split(
      /\b(?:durante|despues|antes|tras|mientras)\b/u,
    )[0];
    const other = /\b(?:vacacion\w*|reasign\w*|permuta\w*|destaqu\w*)\b/u.exec(
      object,
    );
    const medical =
      /\b(?:descanso medico|licencia medica|incapacidad temporal|citt)\b/u.exec(
        object,
      );
    return other !== null && (medical === null || other.index < medical.index);
  });
}

function followUp(text: string): boolean {
  const plain = text.replace(/[¿?¡!.]/gu, '').trim();
  return /^(?:y\s+)?(?:(?:ese|el)\s+plazo|(?:los|que)\s+(?:documentos|requisitos)(?:\s+(?:piden|adjunto|presento))?|(?:que|cual)\s+(?:plazo|es\s+el\s+plazo)(?:\s+(?:tengo|tiene))?|(?:si\s+)?(?:estoy|esta)\s+hospitalizad[oa]|(?:esa|la)\s+constancia)$/u.test(
    plain,
  );
}

const deadlineReferents = new Set<MedicalIntent>([
  'deadline',
  'citt_deadline',
  'resolution_deadline',
  'forwarding_deadline',
  'hospitalization',
]);

export function resolveMedicalLeaveApplicability(
  userTurns: readonly string[],
  isMedical: (question: string) => boolean,
): MedicalLeaveApplicability | null {
  return userTurns.reduce<MedicalLeaveApplicability | null>(
    (active, question, turn) => {
      const text = normalizeSpanishText(question);
      const parts = clauses(text);
      const statement =
        parts.length > 0 &&
        parts.every((part) => declarations(part).length > 0);
      if (medicalRequestConcernsAnotherTopic(question)) return null;
      const direct = isMedical(question);
      const current = bindBeneficiary(parts);
      const targetChange = parts.some(
        (part) => part.words[0] === 'pregunto' && target(part) !== null,
      );
      const anaphoric =
        direct &&
        /\b(?:ese\s+(?:descanso|citt)|esa\s+(?:licencia|incapacidad))\b/u.test(
          text,
        );
      const shortRole = roleAt(parts[0]?.words ?? [], 0);
      const roleReply =
        active?.regime === null &&
        parts.length === 1 &&
        !parts[0].interrogative &&
        shortRole?.end === parts[0].words.length
          ? shortRole.regime
          : null;
      const previous: MedicalLeaveApplicability | null =
        active &&
        (followUp(text) ||
          statement ||
          targetChange ||
          anaphoric ||
          roleReply !== null)
          ? active
          : null;
      if (!direct && !previous) return null;
      const selfCorrection = statement && previous?.subject !== 'third_party';
      const negatesPrior =
        previous?.subject === 'self' &&
        previous.regime !== null &&
        current.excluded?.has(previous.regime);
      const changed =
        targetChange ||
        selfCorrection ||
        current.evidence === 'other' ||
        current.evidence === 'conflicting' ||
        negatesPrior ||
        (!statement &&
          current.evidence === 'self' &&
          previous?.subject !== 'self') ||
        (current.regime !== null && !statement);
      const keep = previous !== null && !changed;
      const subject = keep
        ? previous.subject
        : negatesPrior && current.evidence === 'absent'
          ? 'self'
          : current.subject;
      const regime = roleReply ?? (keep ? previous.regime : current.regime);
      const exclusions = new Set<MedicalRegime>(
        subject === 'self'
          ? [
              ...(previous?.subject === 'self' ? previous.excludedRegimes : []),
              ...(current.excluded ?? []),
            ]
          : [],
      );
      if (regime) exclusions.delete(regime);
      let intent = medicalIntentOf(question);
      if (previous && (statement || roleReply || (targetChange && !direct)))
        intent = previous.intent;
      else if (
        previous &&
        intent === 'deadline' &&
        /^¿?(?:y\s+)?ese plazo\??$/u.test(text) &&
        deadlineReferents.has(previous.intent)
      )
        intent = previous.intent;
      else if (
        previous?.intent === 'hospitalization' &&
        followUp(text) &&
        (intent === 'deadline' || /constancia/u.test(text))
      )
        intent = 'hospitalization';
      return {
        subject,
        regime,
        excludedRegimes: [...exclusions],
        confirmation:
          regime === null
            ? 'unresolved'
            : keep && !roleReply
              ? 'inherited'
              : 'explicit',
        subjectTurn: keep
          ? previous.subjectTurn
          : subject === 'unspecified'
            ? null
            : turn,
        regimeTurn:
          regime === null
            ? null
            : keep && !roleReply
              ? previous.regimeTurn
              : turn,
        intent,
      };
    },
    null,
  );
}
