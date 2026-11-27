import {
  INTENT_EXPANSIONS,
  INTENT_METADATA,
  INTENT_ROUTING,
  INTENT_SYNONYMS,
  INTENT_TRIGGERS,
  normativeTermFor,
} from './intent-routing.config';
import { detectTopicIntent } from './topic-intent';
import { processCanonicalQuery } from './process-context';
import { reassignmentEvidenceQueries } from './reassignment-retrieval';
import { remunerationEvidenceQueries } from './remuneration-retrieval';
import { rationalizationEvidenceQueries } from './rationalization-retrieval';
import { temporaryPlacementQueries } from './temporary-placement-retrieval';

/**
 * Caracterización del paso 1. Antes de crear la configuración, estas mismas
 * entradas producían exactamente las salidas literales de abajo (capturadas con
 * `ts-node` sobre el código previo al refactor). La migración tiene que ser
 * invisible para la lógica de negocio.
 */
describe('enrutamiento declarativo de intenciones', () => {
  it('declara las doce intenciones y sus módulos destino', () => {
    expect(INTENT_ROUTING.intents).toHaveLength(12);
    expect(
      INTENT_ROUTING.intents.find((entry) => entry.id === 'document-relations'),
    ).toMatchObject({
      module: 'Ley y reglamento',
      triggers: ['DOCUMENT_RELATIONS_TRIGGER'],
      expansions: ['DOCUMENT_RELATIONS_QUERY'],
    });
    expect(
      INTENT_ROUTING.intents.find((entry) => entry.id === 'reassignment'),
    ).toMatchObject({
      label: 'la reasignación docente',
      module: 'Contratación y desplazamientos',
    });
    expect(
      INTENT_ROUTING.intents.find(
        (entry) => entry.id === 'auxiliary-requirements',
      ),
    ).toMatchObject({ module: 'Auxiliar de educación' });
    expect(
      INTENT_ROUTING.intents.find((entry) => entry.id === 'rural-allocation'),
    ).toMatchObject({ module: 'Remuneraciones' });
  });

  it('toda referencia de la configuración apunta a un dato existente', () => {
    const triggers: Readonly<Record<string, RegExp>> = INTENT_TRIGGERS;
    const expansions: Readonly<Record<string, string>> = INTENT_EXPANSIONS;
    for (const entry of INTENT_ROUTING.intents) {
      for (const trigger of entry.triggers) {
        expect(INTENT_TRIGGERS).toHaveProperty(trigger);
        expect(triggers[trigger]).toBeInstanceOf(RegExp);
      }
      for (const expansion of entry.expansions) {
        expect(INTENT_EXPANSIONS).toHaveProperty(expansion);
        expect(typeof expansions[expansion]).toBe('string');
      }
    }
  });

  it('registra las expansiones nuevas en la fachada de enrutamiento', () => {
    expect(
      INTENT_ROUTING.intents.find((entry) => entry.id === 'rationalization')
        ?.expansions,
    ).toContain('RATIONALIZATION_MATRICULA');
    expect(
      INTENT_ROUTING.intents.find((entry) => entry.id === 'teaching-hours')
        ?.expansions,
    ).toContain('TEACHING_HOURS_DECISION');
  });

  it('conserva los metadatos que usaba topic-intent.ts', () => {
    expect(INTENT_METADATA.disciplinary).toEqual({
      id: 'disciplinary',
      label:
        'el procedimiento administrativo disciplinario y el derecho de defensa',
      moduleName: 'Situaciones Administrativas',
    });
    expect(INTENT_METADATA['position-classifier'].moduleName).toBe(
      'Cargos y plazas',
    );
  });

  it('registra los coloquiales del término del contrato', () => {
    expect(INTENT_SYNONYMS).toEqual({
      botar: 'término de contrato',
      sacar: 'conclusión de vínculo laboral',
      'no me renuevan': 'no renovación del contrato',
      'me dan de baja': 'baja del contrato',
    });
    expect(normativeTermFor('botar')).toBe('término de contrato');
    expect(normativeTermFor('término de contrato')).toBeNull();
  });

  it.each([
    ['como destacarme en otro colegio', 'temporary-placement'],
    ['soy auxiliar y quiero reasignarme', 'reassignment'],
    ['estan bajando los alumnos y van a reducir plazas', 'rationalization'],
    ['que es el cuadro de distribucion de horas', 'teaching-hours'],
    ['me inician un proceso disciplinario', 'disciplinary'],
    ['cuanto gana un docente contratado de segunda escala', null],
    ['hablame mas sobre las situaciones', null],
  ])('detecta la misma intención para «%s»', (question, expected) => {
    expect(detectTopicIntent(question)?.id ?? null).toBe(expected);
  });

  it('mantiene la expansión canónica del proceso del hilo', () => {
    const intent = detectTopicIntent('quiero reasignarme')!;
    expect(
      processCanonicalQuery(
        intent,
        'quiero reasignarme a otra ugel por unidad familiar',
        [],
      ),
    ).toBe(
      'reasignación docente requisitos etapas proceso norma técnica de reasignación y permuta unidad familiar',
    );
  });

  it('mantiene las consultas canónicas de reasignación', () => {
    expect(
      reassignmentEvidenceQueries(
        'quiero reasignarme a otra ugel por unidad familiar',
      ),
    ).toEqual([
      'reasignación docente unidad familiar requisitos traslado otra región convivencia familiar',
      'reasignación docente requisitos etapas proceso norma técnica de reasignación y permuta',
      'causales de reasignación docente salud emergencia unidad familiar interés personal requisitos',
    ]);
  });

  it('mantiene las consultas canónicas de remuneración', () => {
    expect(
      remunerationEvidenceQueries(
        'cuanto gana un docente contratado de segunda escala',
      ),
    ).toEqual([
      'monto de la remuneración íntegra mensual RIM primera escala magisterial',
      'monto de la remuneración mensual del profesor contratado jornada laboral',
      'incremento posterior de la remuneración íntegra mensual RIM primera escala magisterial',
    ]);
  });

  it('mantiene las consultas canónicas de racionalización y destaque', () => {
    expect(
      rationalizationEvidenceQueries(
        'estan bajando los alumnos y van a reducir plazas',
      ),
    ).toEqual([
      'racionalización de plazas docentes reducción de plazas por disminución de estudiantes',
      'proceso de racionalización de plazas instituciones educativas reducción secciones',
      'disminución de matrícula plazas excedentes proceso de racionalización reubicación docente',
    ]);
    // Sin señal de matrícula/alumnos no se añade la variante del corpus.
    expect(
      rationalizationEvidenceQueries('proceso de racionalización de plazas'),
    ).toEqual([
      'racionalización de plazas docentes reducción de plazas por disminución de estudiantes',
      'proceso de racionalización de plazas instituciones educativas reducción secciones',
    ]);
    expect(
      temporaryPlacementQueries('como destacarme en otro colegio'),
    ).toEqual([
      'destaque docente requisitos procedimiento solicitud plazo norma técnica',
    ]);
  });

  it('mantiene los disparadores literales que decidían la intención', () => {
    const text = 'soy auxiliar y quiero reasignarme a otra ugel';
    expect(INTENT_TRIGGERS.AUXILIARY_SIGNAL.test(text)).toBe(true);
    expect(INTENT_TRIGGERS.REASSIGNMENT_SIGNAL.test(text)).toBe(true);
    expect(INTENT_TRIGGERS.CONTRACT_EXIT_FROM_POSITION.test('me botan')).toBe(
      false,
    );
    expect(
      INTENT_TRIGGERS.CONTRACT_EXIT_FROM_POSITION.test('me botan de mi plaza'),
    ).toBe(true);
  });

  it('congela el patrón de los disparadores sensibles del corpus', () => {
    // Si alguien reescribe una de estas expresiones para «limpiarla», la
    // caracterización falla aunque la suite general siga verde.
    expect(INTENT_TRIGGERS.REASSIGNMENT_SIGNAL.source).toBe(
      '\\b(?:reasignacion(?:es)?|reasignar(?:me|se|nos)?)\\b',
    );
    expect(INTENT_TRIGGERS.DESTAQUE_NOUN.source).toBe('\\bdestaques?\\b');
    expect(INTENT_TRIGGERS.RURAL_SIGNAL.source).toBe(
      '\\b(?:rural(?:es|idad)?|zona\\s+rural|[aá]mbito\\s+rural)\\b',
    );
    expect(INTENT_TRIGGERS.CONTRACT_TERMINATION_EVENT.source).toContain(
      'renuev',
    );
    expect(INTENT_TRIGGERS.LEGAL_SANCTIONS_TRIGGER.source).toBe(
      '\\bsancion|\\bdestitucion|\\bremocion|\\bremov(?:er|ido|ida)|\\bfalta|\\bdisciplin|\\bpierde\\b|\\bp[eé]rdida\\b|\\bnombramiento\\b',
    );
    // «Remoción/removido» activan la expansión legal de sanciones; «cese» y
    // «destitución» ya lo hacían y no deben duplicarse.
    expect(
      INTENT_TRIGGERS.LEGAL_SANCTIONS_TRIGGER.test(
        '¿cuándo un director es removido de su cargo?',
      ),
    ).toBe(true);
    // El pipeline normaliza el texto antes de evaluar los triggers.
    expect(
      INTENT_TRIGGERS.LEGAL_SANCTIONS_TRIGGER.test('remocion de un docente'),
    ).toBe(true);
    expect(
      INTENT_TRIGGERS.EVALUATION_MASTERS_TRIGGER.test('tengo maestría'),
    ).toBe(true);
  });
});
