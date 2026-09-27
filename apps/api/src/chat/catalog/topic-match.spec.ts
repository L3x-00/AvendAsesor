import {
  buildVocabulary,
  correctDomainTypos,
  detectOverviewRequest,
  editDistance,
  matchTopicModule,
} from './topic-match';

const modules = [
  { id: 'rem', name: 'Remuneraciones', parentModuleId: null },
  { id: 'esc', name: 'Escala remunerativa', parentModuleId: 'rem' },
  { id: 'asi', name: 'Asignaciones y bonificaciones', parentModuleId: 'rem' },
  { id: 'lic', name: 'Licencias docentes', parentModuleId: 'sit' },
  { id: 'sit', name: 'Situaciones administrativas', parentModuleId: null },
  { id: 'ley', name: 'Ley y reglamento', parentModuleId: null },
];

const vocabulary = buildVocabulary([
  ...modules.map((module) => module.name),
  'Aprueban Padrones de Instituciones Educativas Públicas',
]);

describe('editDistance', () => {
  it('cuenta sustituciones, inserciones y letras vecinas cambiadas', () => {
    expect(editDistance('remuneracion', 'remuneracion')).toBe(0);
    expect(editDistance('renumeracion', 'remuneracion')).toBe(2);
    expect(editDistance('licensia', 'licencia')).toBe(1);
    expect(editDistance('ab', 'ba')).toBe(1);
    expect(editDistance('', 'abc')).toBe(3);
  });
});

describe('correctDomainTypos', () => {
  it.each([
    ['de que trata la renumeracion', 'de que trata la remuneraciones'],
    ['¿Qué hay sobre renumreaciones?', '¿Qué hay sobre remuneraciones?'],
    ['licensias docentes', 'licencias docentes'],
  ])('«%s» → «%s»', (question, expected) => {
    expect(correctDomainTypos(question, vocabulary)).toBe(expected);
  });

  it('no toca palabras correctas, cortas ni sin un candidato claro', () => {
    const question = '¿Cuál es el plazo para pedir mi cese por límite de edad?';
    expect(correctDomainTypos(question, vocabulary)).toBe(question);
    expect(correctDomainTypos('Escala remunerativa', vocabulary)).toBe(
      'Escala remunerativa',
    );
    expect(correctDomainTypos('hola', new Map())).toBe('hola');
  });

  it('ante dos candidatos igual de cercanos no adivina', () => {
    const tied = buildVocabulary(['cargas', 'cargos']);
    expect(correctDomainTypos('cargus', tied)).toBe('cargus');
  });
});

describe('matchTopicModule', () => {
  it.each([
    ['remuneraciones', 'rem'],
    ['la remuneracion', 'rem'],
    ['escala remunerativa', 'esc'],
    ['licencias', 'lic'],
    ['asignaciones', 'asi'],
  ])('«%s» → %s', (topic, id) => {
    expect(matchTopicModule(topic, modules)?.id).toBe(id);
  });

  it('sin coincidencia clara no elige ninguno', () => {
    expect(matchTopicModule('articulo 5 de la ley', modules)).toBeNull();
    expect(matchTopicModule('de el', modules)).toBeNull();
    expect(
      matchTopicModule('remuneraciones', [
        { id: 'x', name: 'y z', parentModuleId: null },
      ]),
    ).toBeNull();
  });

  it('a igual coincidencia prefiere el tema principal', () => {
    expect(
      matchTopicModule('remuneraciones', [
        { id: 'hijo', name: 'Remuneraciones', parentModuleId: 'padre' },
        { id: 'padre', name: 'Remuneraciones', parentModuleId: null },
      ])?.id,
    ).toBe('padre');
  });
});

describe('detectOverviewRequest', () => {
  it.each([
    ['de que trata la remuneracion', 'remuneracion'],
    ['¿De qué trata?', null],
    ['¿De qué se trata este tema?', null],
    ['resumen de las licencias', 'licencias'],
    ['¿De qué tienes información sobre licencias?', 'licencias'],
    ['¿Qué documentos tienes sobre remuneraciones?', 'remuneraciones'],
    [
      'en base a "remuneraciones" de que tienes informacion respecto a ello',
      'remuneraciones',
    ],
  ])('«%s» pide el panorama de «%s»', (question, topic) => {
    expect(detectOverviewRequest(question)).toEqual({ topic });
  });

  it.each([
    '¿Cuál es el plazo de la licencia?',
    '¿Qué documentos necesito si me descuentan?',
    '¿Qué documentos hay que presentar?',
    'Hola',
  ])('«%s» no es un pedido de panorama', (question) => {
    expect(detectOverviewRequest(question)).toBeUndefined();
  });
});

describe('regresiones con los módulos reales', () => {
  const realVocabulary = buildVocabulary([
    'Cargos y plazas',
    'Cuadro de horas pedagógicas',
    'Remuneraciones',
    'Escala remunerativa',
    'Ley y reglamento',
    'Licencias docentes',
    'Racionalización de plazas',
  ]);
  const realModules = [
    { id: 'ley', name: 'Ley y reglamento', parentModuleId: null },
    { id: 'lic', name: 'Licencias docentes', parentModuleId: 'sit' },
    { id: 'car', name: 'Cargos y plazas', parentModuleId: null },
  ];

  it.each([
    '¿Cuál es el plazo de la licencia?',
    'Quiero saber mi carga horaria',
    'la remuneracion del docente',
  ])('no cambia palabras correctas: «%s»', (question) => {
    expect(correctDomainTypos(question, realVocabulary)).toBe(question);
  });

  it.each([
    '¿De qué trata el artículo 12 del reglamento?',
    'Dame un resumen de los requisitos para la licencia por maternidad',
    '¿Qué documentos tienes sobre el plazo de la licencia?',
  ])('una consulta puntual no se toma como panorama: «%s»', (question) => {
    const request = detectOverviewRequest(question);
    expect(
      request === undefined ||
        (request.topic !== null &&
          matchTopicModule(request.topic, realModules) === null),
    ).toBe(true);
  });

  it('el tema debe hablar sobre todo del módulo', () => {
    expect(
      matchTopicModule('normas del reglamento de evaluación', realModules),
    ).toBeNull();
    expect(matchTopicModule('el reglamento', realModules)?.id).toBe('ley');
  });
});
