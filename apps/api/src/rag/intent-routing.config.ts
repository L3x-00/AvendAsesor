/**
 * Configuración declarativa del enrutamiento de intenciones del RAG.
 *
 * Este archivo es una **fachada de datos**: reúne los disparadores léxicos, las
 * expansiones canónicas y el módulo destino que antes vivían repartidos en
 * `topic-intent.ts`, `process-context.ts` y los `*-retrieval.ts`. La lógica de
 * decisión (combinaciones de señales, negaciones, guardas de evidencia) sigue en
 * esos módulos y consume esta configuración. Añadir una intención, un sinónimo o
 * una expansión no debe exigir tocar esa lógica.
 *
 * Regla de oro: los literales son los que había en producción. Esta capa no
 * interpreta, no puntúa y no relaja ninguna compuerta; por eso el comportamiento
 * observable tiene que ser idéntico (ver `intent-routing.config.spec.ts`).
 */

export interface IntentRoutingMetadata {
  id: string;
  label: string;
  moduleName: string;
}

export interface IntentRoutingEntry extends IntentRoutingMetadata {
  /** Módulo destino (alias legible de `moduleName`). */
  module: string;
  /** Disparadores léxicos de la intención (nombres de `INTENT_TRIGGERS`). */
  triggers: readonly string[];
  /** Consultas canónicas de la intención (nombres de `INTENT_EXPANSIONS`). */
  expansions: readonly string[];
}

export interface IntentRoutingConfig {
  intents: readonly IntentRoutingEntry[];
  /** Coloquial → denominación normativa usada por el corpus. */
  synonyms: Readonly<Record<string, string>>;
}

/** Denominación y módulo de cada intención (antes `INTENTS` en topic-intent.ts). */
export const INTENT_METADATA = {
  reassignment: {
    id: 'reassignment',
    label: 'la reasignación docente',
    moduleName: 'Contratación y desplazamientos',
  },
  'temporary-placement': {
    id: 'temporary-placement',
    label: 'el destaque docente',
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
  'document-relations': {
    id: 'document-relations',
    label: 'las normas relacionadas con un documento',
    moduleName: 'Ley y reglamento',
  },
} as const satisfies Record<string, IntentRoutingMetadata>;

/** Módulo con régimen documental propio, compartido por varias intenciones. */
export const AUXILIARY_MODULE_NAME = 'Auxiliar de educación';

/**
 * Disparadores léxicos. La clave es el nombre que usaba el código de negocio;
 * el valor es exactamente la misma expresión regular. Se evalúan siempre sobre
 * `normalizeSpanishText(...)`.
 */
export const INTENT_TRIGGERS = {
  // Pedido de casos/situaciones del proceso del hilo
  PROCESS_CASES:
    /\b(?:casos?|situaciones?|supuestos?|ejemplos?|escenarios?)\b/u,

  // Reasignación
  REASSIGNMENT_SIGNAL: /\b(?:reasignacion(?:es)?|reasignar(?:me|se|nos)?)\b/u,
  AUXILIARY_ROLE_SIGNAL: /\bauxiliar(?:es)?(?:\s+de\s+educaci[oó]n)?\b/u,
  TEACHING_ROLE_SIGNAL:
    /\b(?:nombrad[oa]s?|contratad[oa]s?|docentes?|profesor(?:a|es|as)?|maestr[oa]s?)\b/u,
  FIRST_PERSON_AUXILIARY:
    /\b(?:soy|trabajo como|me desempe[nñ]o como|estoy como)\s+(?:un |una |el |la )?auxiliar(?:es)?(?:\s+de\s+educaci[oó]n)?\b/u,
  FIRST_PERSON_TEACHER:
    /\b(?:soy|trabajo como|me desempe[nñ]o como|estoy como)\s+(?:un |una |el |la )?(?:docente|profesor(?:a)?|maestr[oa]|nombrad[oa]|contratad[oa])\b/u,
  RELOCATION_SIGNAL:
    /\b(?:quiero|quisiera|deseo|necesito|planeo|pienso)\s+(?:irme|mudarme|trasladarme|reubicarme|cambiarme)\b|\b(?:irme|mudarme|trasladarme|reubicarme)\s+(?:a|hacia|para)\b|\b(?:trasladar(?:me|se|nos)?|reubicar(?:me|nos)?|mudar(?:me|se|nos)?)\s+(?:a|hacia|de)\b|\bcambiar(?:me)?\s+de\s+(?:colegio|ie|institucion educativa|region|ciudad|departamento|ugel|dre|plaza|lugar)\b/u,

  // Destaque
  NEGATED_TEMPORARY_PLACEMENT:
    /\bno\s+(?:quiero|deseo|necesito|busco|me\s+interesa)\s+(?:(?:un|una|el|la)\s+)?(?:destaques?|destacarme|destacarse|destacar)\b/u,
  NEGATED_MOVE:
    /\bno\s+(?:quiero|deseo|necesito|busco)\s+(?:trabajar|irme|trasladarme|desplazarme|cambiarme)\b/u,
  OTHER_REGIME_OR_OBJECT:
    /\b(?:auxiliar(?:es)?|estacionamiento|aparcamiento|parking|vehicul\p{L}*)\b/u,
  DESTAQUE_NOUN: /\bdestaques?\b/u,
  DESTAQUE_SELF: /\bdestacar(?:me|se|nos|lo|la)\b/u,
  DESTAQUE_FIRST_PERSON: /\bme\s+destac(?:o|are|aria|e)\b/u,
  DESTAQUE_CONJUGATED: /\bdestac(?:ar|o|a|an|amos|are|aria|aran)\b/u,
  DESTAQUE_PARTICIPLE: /\bdestacad[oa]s?\b/u,
  THIRD_PARTY_SUBJECT:
    /\b(?:mi|su|nuestro|nuestra|el|la|los|las|un|una)\s+(?:hijos?|hijas?|alumnos?|alumnas?|estudiantes?|apoderados?)\b/u,
  TRANSFER_CONTEXT:
    /\b(?:nombrad[oa]s?|plazas?|plaza de origen|colegios?|escuelas?|institucion educativa|\bie\b|ugel|dre|otr[oa]s?\s+(?:colegio|escuela|institucion educativa|ie|ugel|dre|plaza|region|provincia|zona|localidad|distrito))\b/u,
  RENEWAL: /\b(?:renov\p{L}*|prorrog\p{L}*|ampliacion|vigencia)\b/u,

  // Auxiliares
  AUXILIARY_SIGNAL: /\bauxiliar(?:es)?(?:\s+de\s+educaci[oó]n)?\b/u,
  AUXILIARY_EDUCATION_SIGNAL: /\bauxiliar(?:es)?\s+de\s+educaci[oó]n\b/u,
  AUXILIARY_CONTRACT_SIGNAL:
    /\b(?:trabajar|postular|contrataci[oó]n|contrato|requisitos?)\b/u,
  AUXILIARY_SALARY_SIGNAL:
    /\b(?:cu[aá]nto\s+gana|remuneraci[oó]n|sueldo|salario|percibe|paga)\b/u,
  AUXILIARY_MEDICAL_LEAVE_SIGNAL:
    /\b(?:licencia|enfermedad|incapacidad|descanso\s+m[eé]dico|citt)\b/u,
  APPOINTMENT_SIGNAL: /\b(?:nombramiento|nombrarme)\b/u,
  AUXILIARY_REASSIGNMENT_SIGNAL: /\b(?:reasignaci[oó]n|reasignar)\b/u,
  AUXILIARY_VACATION_SIGNAL: /\bvacaciones?|vacacional(?:es)?\b/u,
  EXCHANGE_SIGNAL:
    /\bpermuta(?:r)?\b|\b(?:intercambiar|intercambio|cambiar)\s+(?:mi|la|una|su)\s+plaza\b/u,

  // Remuneraciones
  RIM_SIGNAL:
    /\b(?:rim|remuneraci[oó]n(?:es)?|sueldo(?:s)?|salario(?:s)?|gan(?:a|an|amos|ar|ar[ií]a|ar[ií]an)|percib(?:e|en|ir)|escala(?:s)?\s+magisterial(?:es)?)\b/u,
  SCALE_SIGNAL:
    /\b(?:primera|segunda|tercera|cuarta|quinta|sexta|s[eé]ptima|octava|escala(?:s)?|ascens[oa])\b/u,
  SALARY_CONTRACT_SIGNAL: /\b(?:nombrad[oa]s?|contratad[oa]s?)\b/u,
  RURAL_SIGNAL: /\b(?:rural(?:es|idad)?|zona\s+rural|[aá]mbito\s+rural)\b/u,
  PADRON_SIGNAL: /\b(?:padr[oó]n(?:es)?|figura|incluid[oa]|listad[oa])\b/u,
  PAYROLL_DETAIL_SIGNAL:
    /\b(?:descuento(?:s)?|deducci[oó]n|diferencia(?:s)?\s+remunerativa(?:s)?|monto\s+menor)\b/u,
  REINTEGRATION_SIGNAL: /\breintegro(?:s)?\b/u,
  PAYROLL_DOCUMENT_SIGNAL: /\b(?:boleta|planilla)\b/u,
  PAYROLL_DOCUMENT_CONTEXT:
    /\b(?:remuneraci[oó]n(?:es)?|sueldo(?:s)?|salario(?:s)?|haberes|descuento(?:s)?|deducci[oó]n|reintegro(?:s)?)\b/u,
  CLAIM_SIGNAL: /\b(?:reclamo|reclamar|revision|revisar)\b/u,
  SALARY_REVIEW_CONTEXT:
    /\b(?:remuneraci[oó]n(?:es)?|sueldo(?:s)?|salario(?:s)?|haberes)\b/u,
  SALARY_ASCENSO_SIGNAL:
    /\b(?:ascenso|ascensos|ascend(?:er|ido|iendo)|asciend[oa])\b/u,
  ALLOCATION_SIGNAL: /\b(?:asignaci[oó]n|bono|beneficio|pago)\b/u,
  AMOUNT_REQUEST_SIGNAL:
    /\b(?:cuanto|cu[aá]nto).{0,50}\b(?:corresponde|percibo|recibo)|\bme\s+corresponde\b/u,

  // Situaciones administrativas
  MEDICAL_LEAVE_SIGNAL:
    /\b(?:descanso\s+medic(?:o|a)|incapacidad\s+temporal|enferm(?:o|a|edad).{0,64}\b(?:dia|dias|faltar|ausen|licencia)|(?:dia|dias|faltar|ausen).{0,64}\benferm(?:o|a|edad))\b/u,
  PRESCRIBED_REST_SIGNAL:
    /\b(?:doctor(?:a)?|medic(?:o|a)|profesional de la salud)\b.{0,80}\b(?:descanso|reposo|incapacidad)\b|\b(?:descanso|reposo)\b.{0,40}\b(?:por|de)\s+\d{1,3}\s+(?:dias?|semanas?)\b/u,
  PERSONAL_ABSENCE_SIGNAL:
    /\b(?:motivos?|asuntos?)\s+particulares?\b|\bfaltar.{0,48}\b(?:dia|dias)\b/u,
  ADMINISTRATIVE_VACATION_SIGNAL: /\bvacacion(?:es)?\b/u,
  EMPLOYMENT_STATUS_SIGNAL: /\b(?:nombrad[oa]s?|contratad[oa]s?)\b/u,
  ESCALAFON_SIGNAL: /\b(?:escalafon(?:ario)?|informe\s+escalafonario)\b/u,
  TARDINESS_SIGNAL:
    /\b(?:tardanz(?:a|as)|lleg(?:ar|ue|o)\s+tarde|retras(?:o|os))\b/u,
  DISCIPLINARY_PROCESS_SIGNAL:
    /\b(?:procedimiento\s+(?:administrativo\s+)?disciplinario|proceso\s+(?:administrativo\s+)?disciplinario|pad)\b/u,
  DISCIPLINARY_SUBJECT_SIGNAL:
    /\b(?:sancion(?:es|ad[oa]s?)?|sancionar|defen[sd](?:a|er(?:se)?)|descargos?|destitu(?:i|y)\p{L}*|destitucion|remocion|remov(?:er|ido|ida|idos|idas))\b/u,
  DISCIPLINARY_CONTEXT_SIGNAL:
    /\b(?:docent(?:e|es)?|profesor(?:a|es|as)?|director(?:a|es|as)?|cargo|puesto|derecho|notificaci[oó]n|procedimiento)\b/u,
  WORKDAY_SIGNAL:
    /\b(?:jornada|horas?|carga\s+horaria|horas?\s+de\s+clase|pedagogic[ao]s?|complementarias?)\b/u,
  SCHOOL_LEVEL_SIGNAL: /\b(?:secundaria|inicial|primaria|eb[rae]|cetpro)\b/u,
  CONTRACT_WORD: /\bcontratos?\b/u,
  NON_EDUCATION_CONTRACT:
    /\bcontratos?\s+(?:de|del)\s+(?:alquiler|arrendamiento|locacion|luz|agua|gas|telefono|internet|cable|tarjeta|credito|prestamo|compraventa|obra|seguro|alimentos?|matrimonio|franquicia)\b|\b(?:empresa|compania|negocio)\s+(?:privad[ao]s?|particular)\b(?!\s+(?:(?!\b(?:no|sin)\b)\p{L}+\s+){0,3}(?:educativ|de educacion|del sector educativo))|\ben\s+(?:la|una)\s+empresa\b(?!\s+(?:(?!\b(?:no|sin)\b)\p{L}+\s+){0,3}(?:educativ|de educacion|del sector educativo))/u,
  CONTRACT_EXIT_FROM_POSITION:
    /\b(?:bot|sac|saqu|separ|retir|ech|quit)(?:ar|an|aron|ara|aran|en|e|o|a)(?:me|te|se|nos|los|las|lo|la|le)?\s+(?:de|del)\s+(?:mi|tu|su|sus|nuestros?|nuestras?|el|la|los|las|un|una)?\s*(?:plaza|contrato|cargo|puesto|trabajo)\b/u,
  CONTRACT_TERMINATION_EVENT:
    /\b(?:termin|acab|venc)(?:a|an|o|e|en|io|ara|aran)\b[\s\S]{0,30}\b(?:mi|el|tu|su)\s+contrato\b|\b(?:mi|el|tu|su)\s+contrato\s+(?:vence|termina|acaba|concluye|finaliza)\b(?!\s+de\s+(?:empezar|iniciar|comenzar|pagar|devengar|suscribir|firmar|pactar)(?:se|me|te|lo|la|le|nos|los|las)?\b)|\bno\s+(?:me\s+)?(?:renuev(?:an|en|a)|contratan|contrataron)\b[\s\S]{0,20}\bcontrato\b|\b(?:dan|da|dieron|dio)\s+de\s+baja\s+(?:de(?:l)?\s+)?(?:mi\s+|su\s+)?contrato\b|\b(?:mi|el|su)\s+contrato\s+(?:es|va)\s+hasta\b/u,
  CONTRACT_DISMISSAL:
    /\b(?:desped(?:ir(?:me|te|se|nos|los|las|lo|la|le)?|ido|ida|e|en|o)|despid(?:e|en|an|o|ieron|a|as))\b/u,
  AUXILIARY_REGIME_SIGNAL: /\bauxiliar(?:es)?\b|\baux\b/u,
  AUXILIARY_REGIME_IN_QUESTION: /\bauxiliar(?:es)?\b|\baux\b/u,

  // Evaluación y ascenso
  ASCENSO_SIGNAL:
    /\b(?:ascens(?:o|os)|ascend(?:er|ido|iendo|e|en|io)|asciend(?:[oa]|e|en))\b/u,
  CAREER_PROGRESSION_SIGNAL:
    /\b(?:subir|pasar|ascender|promocionar|avanzar)\s+(?:a\s+|hacia\s+|de\s+)?(?:la\s+)?(?:segunda|tercera|cuarta|quinta|sexta|septima|octava|\d)\s+escala\b|\b(?:primera|1)\s+escala\b[\s\S]{0,80}\b(?:subir|pasar|ascender|promocionar|avanzar)\b|\b(?:de|desde)\s+(?:la\s+)?(?:primera|1)\s+escala\b[\s\S]{0,60}\b(?:a|hacia)\s+(?:la\s+)?(?:segunda|2)\b/u,
  DESEMPENO_SIGNAL:
    /\b(?:evaluaci[oó]n\s+de[ls]?\s+desempe[nñ]o|desempe[nñ]o\s+docente)\b/u,
  NAMED_SIGNAL: /\b(?:nombrad[oa]s?|carrera\s+publica\s+magisterial)\b/u,
  EVALUATION_CONTRACT_SIGNAL:
    /\b(?:contratad[oa]s?|contrataci[oó]n|renovaci[oó]n\s+de\s+contrato)\b/u,
  COMPARISON_SIGNAL:
    /\b(?:diferencia(?:s)?|compar(?:a|ar|acion)|versus|\bvs\b)\b/u,

  // Racionalización
  RATIONALIZATION_EXPLICIT_SIGNAL: /\bracionalizacion(?:es)?\b/u,
  PLACE_SIGNAL: /\bplazas?\b/u,
  REDUCTION_SIGNAL:
    /\b(?:reduc(?:ir|cion|cir|can|ca)|quitar(?:an|me)?|eliminar(?:an)?|suprim(?:ir|an|en)|recortar(?:an)?|disminu(?:ir|cion|yen|ye))\b/u,
  ENROLLMENT_SIGNAL:
    /\b(?:alumnos?|estudiantes?|matricula|secciones?|aulas?)\b/u,
  DECLINE_SIGNAL:
    /\b(?:bajando|bajan|bajo|disminuyendo|disminuyen|menos|descenso|reduccion|se estan quedando sin)\b/u,

  // Cargos y plazas
  HOURS_SIGNAL: /\bhoras?\b/u,
  OVERTIME_SIGNAL: /\bhoras?\s+extras?\b/u,
  HOURS_DISTRIBUTION:
    /\b(?:cuadro de distribucion de horas|distribucion de horas|carga horaria|horas pedagogicas|carga academica)\b/u,
  HOUR_ASSIGNMENT:
    /\b(?:asignacion(?:es)?|asignan|asigna|distribuyen|distribuye|reparten|reparte|tocan|toca|determina|determinan|dicto|dicta|dictan)\b/u,
  HOUR_DECISION:
    /\bquien\s+(?:decide|deciden|determina|determinan|asigna|asignan|reparte|reparten|define|definen|controla|controlan|elabora|elaboran|organiza|organizan)\b/u,
  SURPLUS_SIGNAL: /\bexcedent(?:e|es)\b/u,
  QUALIFIED_PLACE:
    /\bplazas?\b[\s\S]{0,20}?\b(?:organicas?|eventual(?:es)?)\b|\b(?:organicas?|eventual(?:es)?)\s+plazas?\b/u,
  // Los títulos del corpus llegan con guiones («ANEXO-MANUAL-DE-CLASIFICADOR-
  // DE-CARGOS…»); el encabezado debe reconocerlos igual que el texto con
  // espacios para no descartar un fragmento que sí regula el tema.
  CLASSIFIER_SIGNAL: /\bclasificador(?:es)?[\s\-_]+de[\s\-_]+cargos?\b/u,
  CLASSIFICATION_SIGNAL: /\bclasificacion[\s\-_]+de[\s\-_]+cargos?\b/u,
  COMPETING_PROCESS:
    /\b(?:desta(?:c|qu)\p{L}*|encarg\p{L}*|reasign\p{L}*|permut\p{L}*|racionaliz\p{L}*|contratacion|contratos?|contrat(?:ar|aron|an|arme)|ascens\p{L}*|ascend\p{L}*|asciend\p{L}*|licencias?|descanso medico|ces(?:e|es|en|an|aron|ado)|jubil\p{L}*)\b/u,
  DEFINITION_REQUEST:
    /\b(?:que (?:es|son|significa|significan)|en que consiste|concepto de|definicion de|diferencias? (?:entre|de))[^.]{0,20}\bplazas?\b|\bplazas?\b[^.]{0,20}\b(?:que (?:es|son|significa)|en que consiste)/u,

  // Ley y reglamento
  LEGAL_NORM_SIGNAL:
    /\b(?:ley|reglamento|norma|articulo|numeral|decreto supremo|disposicion|transitori|derog|modificatori|carrera publica magisterial|29944|004-2013)\b/u,
  LEGAL_CONCEPT_SIGNAL:
    /\b(?:derechos?|deberes?|obligaciones?|sancion(?:es)?|destitucion|falta(?:s)?|licencia(?:s)?|permiso(?:s)?|pierde|perdida|nombramiento)\b/u,
  LEGAL_REGULATION_TRIGGER: /\breglamento\b|\b004-2013\b|\bdecreto supremo\b/u,
  LEGAL_RIGHTS_TRIGGER: /\bderechos?\b/u,
  LEGAL_DUTIES_TRIGGER: /\bdeberes?\b|\bobligaciones?\b/u,
  LEGAL_SANCTIONS_TRIGGER:
    /\bsancion|\bdestitucion|\bremocion|\bremov(?:er|ido|ida)|\bfalta|\bdisciplin|\bpierde\b|\bp[eé]rdida\b|\bnombramiento\b/u,
  LEGAL_LICENSES_TRIGGER: /\blicencia|\bpermiso/u,
  LEGAL_PERSONAL_LEAVE_TRIGGER: /motivos particulares/u,
  LEGAL_MODIFICATIONS_TRIGGER:
    /\bmodific|\bderog|\btransitori|\bvigencia|\barticulo\b/u,
  LEGAL_EXPLICIT_LAW_TRIGGER: /\bley\b|\b29944\b|\barticulo\b/u,
  LEGAL_LAW_NAME_TRIGGER: /\bley\b|\b29944\b|\breforma magisterial\b/u,

  // Expandiones de evaluación/ascenso
  EVALUATION_PERMANENCE_TRIGGER:
    /\b(?:permanencia|a[nñ]os?\s+minimos?|tiempo\s+minimo)\b/u,
  EVALUATION_MASTERS_TRIGGER: /\b(?:maestr[ií]a|maestro|grado\s+academico)\b/u,
  EVALUATION_RESULTS_TRIGGER: /\b(?:resultado|reclamo|impugnaci[oó]n)\b/u,

  // Relaciones entre documentos (Paso 3)
  DOCUMENT_RELATIONS_TRIGGER:
    /\b(?:normas?|documentos?)\b[^.]{0,30}\b(?:relacionad[oa]s?|relacionan|vinculad[oa]s?|vinculan)\b|\bque\s+(?:modifica|deroga|reglamenta)\s+(?:(?:la|el|las|los|esta|este|una|un)\s+)?(?:norma|ley|decreto|resolucion|reglamento)\b|\brelaciones?\s+(?:de|entre)\s+(?:las\s+)?normas?\b/u,
} as const satisfies Record<string, RegExp>;

/** Expansiones canónicas: traducción del lenguaje cotidiano al del corpus. */
export const INTENT_EXPANSIONS = {
  // Procesos del hilo (antes PROCESS_CANONICAL_QUERIES / AUXILIARY_PROCESS_QUERIES)
  REASSIGNMENT_PROCESS:
    'reasignación docente requisitos etapas proceso norma técnica de reasignación y permuta',
  TEMPORARY_PLACEMENT_PROCESS:
    'destaque docente requisitos procedimiento solicitud plazo norma técnica',
  MEDICAL_LEAVE_PROCESS:
    'licencia por incapacidad temporal descanso médico CITT certificado médico',
  CAREER_PROGRESSION_PROCESS:
    'concurso de ascenso escala magisterial requisitos etapas prueba nacional trayectoria profesional',
  RURAL_ALLOCATION_PROCESS:
    'asignación por trabajo en ámbito rural padrón de instituciones educativas instrumento habilitante',
  AUXILIARY_REQUIREMENTS_PROCESS:
    'contratación auxiliares educación requisitos por nivel modalidad capacitación edad documentos expediente',
  /** Requisitos generales para ser docente (Ley 29944 Art. 4 y 18), sin ID fijo. */
  TEACHING_REQUIREMENTS_PROCESS:
    'título de profesor licenciado en educación requisitos generales para postular Carrera Pública Magisterial formación inicial Ley 29944',
  DISCIPLINARY_PROCESS:
    'proceso administrativo disciplinario docente derecho de defensa descargos notificación',
  RATIONALIZATION_PROCESS:
    'racionalización de plazas docentes reducción de plazas por disminución de estudiantes',
  TEACHING_HOURS_PROCESS:
    'cuadro de distribución de horas de clase jornada laboral docente institución educativa',
  POSITION_CONDITION_PROCESS:
    'plaza orgánica plaza eventual docente nombramiento cuadro de plazas',
  POSITION_CLASSIFIER_PROCESS:
    'clasificador de cargos niveles de cargo manual de organización y funciones institución educativa',
  AUXILIARY_REASSIGNMENT_PROCESS:
    'reasignación de auxiliares de educación requisitos procedimiento solicitud',
  AUXILIARY_MEDICAL_LEAVE_PROCESS:
    'licencia por incapacidad temporal auxiliares de educación descanso médico CITT certificado',
  PROCESS_CASES_QUERY: 'casos supuestos ejemplos causales',

  // Reasignación
  REASSIGNMENT_AUXILIARY:
    'reasignación auxiliares de educación otra UGEL requisitos causales unidad familiar',
  REASSIGNMENT_UNITY:
    'reasignación docente unidad familiar requisitos traslado otra región convivencia familiar',
  REASSIGNMENT_GENERAL:
    'reasignación docente requisitos etapas proceso norma técnica de reasignación y permuta',
  REASSIGNMENT_CAUSALS:
    'causales de reasignación docente salud emergencia unidad familiar interés personal requisitos',

  // Destaque
  EXPLICIT_DESTAQUE_QUERY:
    'destaque docente requisitos procedimiento solicitud plazo norma técnica',
  DESTAQUE_RENEWAL: 'renovación de destaque plazo prórroga solicitud vigencia',
  DESTAQUE_DESCRIPTIVE:
    'destaque docente temporal plaza de origen requisitos solicitud',

  // Auxiliares
  AUXILIARY_HIRING:
    'contratación auxiliares educación requisitos por nivel modalidad capacitación edad documentos expediente 2026',
  AUXILIARY_SALARY: 'remuneración auxiliar de educación nombrado contratado',
  AUXILIARY_MEDICAL_LEAVE:
    'auxiliar de educación licencia incapacidad temporal enfermedad CITT contratado nombrado',
  AUXILIARY_APPOINTMENT:
    'concurso público nombramiento auxiliar de educación requisitos experiencia',
  AUXILIARY_REASSIGNMENT:
    'reasignación auxiliar de educación otra UGEL requisitos causales titular nombrado',
  AUXILIARY_VACATION:
    'auxiliar de educación vacaciones remuneradas nombrado vacaciones truncas contratado',
  AUXILIARY_EXCHANGE:
    'permuta auxiliar de educación requisitos años servicio edad cronograma',

  // Remuneraciones
  RIM_SCALE_1:
    'monto de la remuneración íntegra mensual RIM primera escala magisterial',
  RIM_CONTRACT:
    'monto de la remuneración mensual del profesor contratado jornada laboral',
  RIM_INCREMENT:
    'incremento posterior de la remuneración íntegra mensual RIM primera escala magisterial',
  RURAL_ASSIGNMENT:
    'asignación por trabajo en ámbito rural padrón de instituciones educativas instrumento habilitante',
  RURAL_PADRON:
    'padrón de instituciones educativas públicas unidocentes y multigrado rural',
  PAYROLL_REVIEW:
    'boleta de pago descuentos diferencias remunerativas planilla única de pagos reintegros actos administrativos',
  ASCENSO_PAYMENT:
    'ascenso de escala magisterial acto resolutivo pago planilla única de pagos',

  // Situaciones administrativas
  ADMIN_MEDICAL_LEAVE:
    'licencia por incapacidad temporal descanso médico CITT certificado médico',
  PERSONAL_ABSENCE_HOURS:
    'permiso por motivos particulares profesor nombrado ausencia por horas requisitos',
  PERSONAL_ABSENCE_LICENSE:
    'licencia por motivos particulares profesor nombrado requisitos solicitud',
  ADMIN_VACATION:
    'vacaciones profesores nombrados contratados Carrera Pública Magisterial',
  TARDINESS:
    'tardanza descuento asistencia tercera tardanza factor minuto jornada laboral profesor',
  ADMIN_DISCIPLINARY:
    'proceso administrativo disciplinario docente derecho de defensa descargos notificación',
  CONTRACT_TERMINATION:
    'conclusión del contrato docente causales de conclusión del contrato término del contrato no renovación del contrato',
  ADMIN_WORKDAY:
    'jornada de trabajo profesor secundaria horas pedagógicas horas lectivas',

  // Evaluación y ascenso
  ASCENSO_CONCURSO:
    'concurso de ascenso escala magisterial requisitos etapas prueba nacional trayectoria profesional',
  DESEMPENO_EVALUATION:
    'evaluación del desempeño docente nombrado consecuencias evaluación desfavorable',
  ASCENSO_PERMANENCE:
    'concurso ascenso permanencia mínima escala magisterial requisitos',
  ASCENSO_MASTERS: 'concurso ascenso maestría puntaje trayectoria profesional',
  ASCENSO_RESULTS:
    'concurso ascenso resultados reclamo comité evaluación cronograma',
  ASCENSO_VS_DESEMPENO:
    'evaluación desempeño docente nombrado concurso ascenso escala magisterial diferencias',

  // Racionalización y cargos
  RATIONALIZATION_PLAZAS:
    'racionalización de plazas docentes reducción de plazas por disminución de estudiantes',
  RATIONALIZATION_SECTIONS:
    'proceso de racionalización de plazas instituciones educativas reducción secciones',
  /** El corpus de la norma 2024 habla de matrícula; «estudiantes» solo apparce
   * en la consulta coloquial. Se activa solo con señal de matrícula/alumnos. */
  RATIONALIZATION_MATRICULA:
    'disminución de matrícula plazas excedentes proceso de racionalización reubicación docente',
  TEACHING_HOURS_TABLE:
    'cuadro de distribución de horas de clase jornada laboral docente institución educativa',
  TEACHING_HOURS_ASSIGNMENT:
    'asignación de horas pedagógicas carga horaria docente nivel inicial primaria secundaria',
  /** Para «quién decide cuántas horas me tocan»: el corpus nombra al comité de
   * cuadro de horas y a la DRE/UGEL que lo conforma, no una regla de jornada. */
  TEACHING_HOURS_DECISION:
    'comité de cuadro de horas responsable aprobación distribución de horas pedagógicas DRE UGEL director institución educativa',
  POSITION_SURPLUS:
    'plazas excedentes reducción de plazas reubicación del personal docente',
  POSITION_CLASSIFIER_DETAIL:
    'clasificador de cargos niveles de cargo manual de organización y funciones institución educativa',
  /** Para «quién se queda a cargo / asume el cargo cuando el director está de
   * licencia»: el corpus nombra la encargatura y a la DRE/UGEL, no la frase
   * coloquial que usa la persona. */
  DIRECTOR_REPLACEMENT:
    'reemplazo del director por licencia encargatura profesor encargado DRE UGEL plaza vacante mayor responsabilidad',

  // Ley y reglamento
  LEGAL_REGULATION:
    'Decreto Supremo 004-2013-ED Reglamento de la Ley de Reforma Magisterial disposiciones',
  LEGAL_RIGHTS:
    'derechos de los profesores Carrera Pública Magisterial Ley de Reforma Magisterial',
  LEGAL_DUTIES:
    'deberes de los profesores Carrera Pública Magisterial Ley de Reforma Magisterial',
  LEGAL_SANCTIONS:
    'sanción destitución cese temporal profesor proceso administrativo disciplinario Ley 29944',
  LEGAL_LICENSES:
    'licencia por motivos particulares profesores requisitos norma técnica licencias permisos vacaciones',
  LEGAL_PERSONAL_LEAVE:
    '5.20 licencia por motivos particulares dos años continuos o discontinuos período cinco años docente nombrado',
  LEGAL_MODIFICATIONS:
    'modificación derogación disposiciones transitorias Ley 29944 vigencia artículo',
  LEGAL_GENERAL:
    'Ley 29944 Ley de Reforma Magisterial reglamento Decreto Supremo 004-2013-ED artículos vigencia',

  // Relaciones entre documentos
  DOCUMENT_RELATIONS_QUERY:
    'normas relacionadas modificaciones derogaciones reglamentos citas complementos',
} as const satisfies Record<string, string>;

/**
 * Catálogo de coloquialismos ya reconocidos por otras reglas. **Registro
 * inactivo en este paso**: no se aplica a la pregunta original porque eso
 * cambiaría la detección actual. `normativeTermFor` es la API preparada para
 * que un futuro altavoz (por ejemplo el reintento contextual) consuma este
 * vocabulario sin editar la lógica de negocio.
 */
export const INTENT_SYNONYMS = {
  botar: 'término de contrato',
  sacar: 'conclusión de vínculo laboral',
  'no me renuevan': 'no renovación del contrato',
  'me dan de baja': 'baja del contrato',
} as const satisfies Readonly<Record<string, string>>;

type IntentId = keyof typeof INTENT_METADATA;

/** Compone una entrada completa a partir de los metadatos y las claves de datos. */
function route(
  id: IntentId,
  triggers: readonly string[],
  expansions: readonly string[],
): IntentRoutingEntry {
  const metadata = INTENT_METADATA[id];
  return { ...metadata, module: metadata.moduleName, triggers, expansions };
}

/** Vista única de la configuración, pensada para inspección y futuros altavoces. */
export const INTENT_ROUTING: IntentRoutingConfig = {
  intents: [
    route(
      'reassignment',
      ['REASSIGNMENT_SIGNAL', 'AUXILIARY_ROLE_SIGNAL', 'RELOCATION_SIGNAL'],
      [
        'REASSIGNMENT_GENERAL',
        'REASSIGNMENT_CAUSALS',
        'REASSIGNMENT_AUXILIARY',
        'REASSIGNMENT_UNITY',
      ],
    ),
    route(
      'temporary-placement',
      ['DESTAQUE_NOUN', 'DESTAQUE_SELF', 'DESTAQUE_FIRST_PERSON'],
      ['EXPLICIT_DESTAQUE_QUERY', 'DESTAQUE_RENEWAL'],
    ),
    route(
      'medical-leave',
      ['MEDICAL_LEAVE_SIGNAL', 'PRESCRIBED_REST_SIGNAL'],
      ['MEDICAL_LEAVE_PROCESS', 'AUXILIARY_MEDICAL_LEAVE'],
    ),
    route(
      'career-progression',
      ['ASCENSO_SIGNAL', 'CAREER_PROGRESSION_SIGNAL'],
      ['CAREER_PROGRESSION_PROCESS', 'ASCENSO_CONCURSO'],
    ),
    route(
      'rural-allocation',
      ['RURAL_SIGNAL', 'ALLOCATION_SIGNAL'],
      ['RURAL_ALLOCATION_PROCESS', 'RURAL_ASSIGNMENT'],
    ),
    route(
      'auxiliary-requirements',
      ['AUXILIARY_SIGNAL', 'AUXILIARY_CONTRACT_SIGNAL'],
      ['AUXILIARY_REQUIREMENTS_PROCESS', 'AUXILIARY_HIRING'],
    ),
    route(
      'disciplinary',
      ['DISCIPLINARY_PROCESS_SIGNAL', 'DISCIPLINARY_SUBJECT_SIGNAL'],
      ['DISCIPLINARY_PROCESS', 'ADMIN_DISCIPLINARY'],
    ),
    route(
      'rationalization',
      ['RATIONALIZATION_EXPLICIT_SIGNAL', 'PLACE_SIGNAL'],
      [
        'RATIONALIZATION_PROCESS',
        'RATIONALIZATION_SECTIONS',
        'RATIONALIZATION_MATRICULA',
      ],
    ),
    route(
      'teaching-hours',
      ['HOURS_DISTRIBUTION', 'HOUR_ASSIGNMENT', 'HOUR_DECISION'],
      [
        'TEACHING_HOURS_PROCESS',
        'TEACHING_HOURS_TABLE',
        'TEACHING_HOURS_DECISION',
      ],
    ),
    route(
      'position-condition',
      ['QUALIFIED_PLACE', 'SURPLUS_SIGNAL'],
      ['POSITION_CONDITION_PROCESS', 'POSITION_SURPLUS'],
    ),
    route(
      'position-classifier',
      ['CLASSIFIER_SIGNAL', 'CLASSIFICATION_SIGNAL'],
      ['POSITION_CLASSIFIER_PROCESS', 'POSITION_CLASSIFIER_DETAIL'],
    ),
    route(
      'document-relations',
      ['DOCUMENT_RELATIONS_TRIGGER'],
      ['DOCUMENT_RELATIONS_QUERY'],
    ),
  ],
  synonyms: INTENT_SYNONYMS,
};

/** Sinónimo normativo de una expresión coloquial, si está registrado. */
export function normativeTermFor(colloquial: string): string | null {
  const synonyms: Readonly<Record<string, string>> = INTENT_SYNONYMS;
  return synonyms[colloquial] ?? null;
}
