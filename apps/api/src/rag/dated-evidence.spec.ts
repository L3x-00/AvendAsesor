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
import type { RetrievedChunk } from './retrieval.gateway';

/** Tabla real del oficio del destaque 2026, tal como la extrae el PDF. */
const DESTAQUE_SCHEDULE =
  'CRONOGRAMA DE DESTAQUE 2026 ACTIVIDADES RESPONSABLES INICIO FIN RENOVACIÓN DE DESTAQUE 1 Presentación de solicitudes IE/UGEL 13.01.2026 14.01.2026 2 Aplicación de la ficha de evaluación (Anexo 5) IE/UGEL 14.01.2026 15.01.2026 3 Resultados de la evaluación IE/UGEL 16.01.2026 4 Remisión de la documentación a la UGEL/DRE de destino IE 19.01.2026 UNIDAD FAMILIAR 5 Presentación de solicitudes UGEL - DRE 19.01.2026 21.01.2026 6 Revisión y evaluación de expedientes Jefe de Recursos Humanos UGEL/DRE 19.01.2026 22.01.2026 7 Conformidad de la UGEL/DRE de origen UGEL/DRE 19.01.2026 23.01.2026 8 Emisión de la resolución de destaque por unidad familiar y de renovación de destaque UGEL/DRE 26.01.2026 26.01.2026';

describe('asksForDates', () => {
  it.each([
    'cuando se dan los destaques?',
    '¿Cuándo se dan los destaques?',
    'CUÁNDO INICIA EL DESTAQUE',
    '¿y cuándo?',
    'y cuando?',
    '¿Hasta cuándo puedo presentar mi solicitud?',
    'desde cuando rige la norma',
    'Quisiera saber cuando empieza la renovación del destaque',
    '¿Cuáles son las fechas del destaque 2026?',
    '¿En qué mes se presentan las solicitudes de reasignación?',
    '¿Cuál es el cronograma de la ratificación?',
    '¿Qué día salen los resultados?',
    '¿Cuál es la fecha límite para inscribirme?',
  ])('reconoce «%s» como pregunta por fechas', (question) => {
    expect(asksForDates(question)).toBe(true);
  });

  it.each([
    '¿Quién reemplaza al director cuando está de licencia?',
    '¿Qué pasa cuando un docente no se presenta?',
    '¿Qué es el destaque?',
    '¿Cuánto gana un docente de 30 horas?',
    '¿Qué pasa si presenté fuera de fecha?',
    '¿Qué requisitos debo cumplir para el destaque?',
  ])('no confunde «%s» con una pregunta por fechas', (question) => {
    expect(asksForDates(question)).toBe(false);
  });
});

describe('distinctDatesIn', () => {
  it('cuenta cada fecha distinta del cronograma real', () => {
    expect(distinctDatesIn(DESTAQUE_SCHEDULE)).toEqual([
      '13.1.2026',
      '14.1.2026',
      '15.1.2026',
      '16.1.2026',
      '19.1.2026',
      '21.1.2026',
      '22.1.2026',
      '23.1.2026',
      '26.1.2026',
    ]);
  });

  it('reconoce fechas con barras, guiones, año corto y escritas con letras', () => {
    expect(
      distinctDatesIn(
        'Del 13/01/2026 al 14-01-2026; resultados el 16.01.26, el 1 de setiembre del 2025 y el 3 de marzo.',
      ),
    ).toEqual(['13.1.2026', '14.1.2026', '16.1.2026', '1.9.2025', '3.3.']);
  });

  it('no toma por fecha un numeral, un código de norma ni un día y mes sin año', () => {
    expect(
      distinctDatesIn(
        'Numeral 6.10.1 y 7.1.10 de la norma; D.S. 070- 2013-PCM y D.S. 026-2016- PCM; RVM N° 009-2026-MINEDU; vigencia del 01.03 en adelante; 32.13.2026.',
      ),
    ).toEqual([]);
  });
});

describe('temas de un cronograma', () => {
  it('quita interrogativos, vocabulario temporal y trámites comunes', () => {
    expect(scheduleTopicTerms('¿Cuándo se dan los destaques?')).toEqual([
      'destaques',
    ]);
    expect(
      scheduleTopicTerms(
        '¿En qué fechas se presentan las solicitudes de destaque 2026?',
      ),
    ).toEqual(['destaque']);
    expect(scheduleTopicTerms('¿y cuándo?')).toEqual([]);
  });

  it('reconoce el tema por su raíz y exige todos los términos solo cuando se pide', () => {
    expect(coversScheduleTopic(DESTAQUE_SCHEDULE, ['destaques'], 'all')).toBe(
      true,
    );
    expect(
      coversScheduleTopic(DESTAQUE_SCHEDULE, ['reasignacion'], 'any'),
    ).toBe(false);
    expect(
      coversScheduleTopic(DESTAQUE_SCHEDULE, ['destaque', 'salud'], 'all'),
    ).toBe(false);
    expect(
      coversScheduleTopic(DESTAQUE_SCHEDULE, ['destaque', 'salud'], 'any'),
    ).toBe(true);
    expect(coversScheduleTopic('Sin tema', [], 'all')).toBe(true);
  });

  it('un cronograma tiene al menos tres fechas y trata el tema consultado', () => {
    expect(isScheduleEvidence(DESTAQUE_SCHEDULE, ['destaques'])).toBe(true);
    expect(
      isScheduleEvidence(
        'El destaque rige del 01.03 al 31.12.2026 y la asistencia técnica es el 16 de enero.',
        ['destaques'],
      ),
    ).toBe(false);
    expect(isScheduleEvidence(DESTAQUE_SCHEDULE, ['ratificacion'])).toBe(false);
  });

  it('arma la consulta canónica con el tema y el año', () => {
    expect(scheduleQuery(['destaques'], 2026)).toBe(
      'cronograma de destaques 2026: actividades, fechas de inicio y fin',
    );
  });
});

describe('withScheduleEvidence', () => {
  const chunk = (
    chunkId: string,
    documentVersionId: string,
  ): RetrievedChunk => ({
    articleReference: null,
    chunkContent: chunkId,
    chunkId,
    documentId: `document-${documentVersionId}`,
    documentSituation: 'current',
    documentTitle: `Documento ${documentVersionId}`,
    documentVersionId,
    lexicalScore: 0,
    moduleIds: ['module'],
    moduleNames: ['Destaque'],
    numeralReference: null,
    pageEnd: 1,
    pageStart: 1,
    sectionTitle: null,
    semanticScore: 0.6,
    versionNumber: 1,
  });

  it('coloca el cronograma junto a su documento y uno ajeno al final', () => {
    const delivered = [
      chunk('a1', 'A'),
      chunk('b1', 'B'),
      chunk('a2', 'A'),
      chunk('c1', 'C'),
    ];

    expect(
      withScheduleEvidence(delivered, [
        chunk('a-tabla', 'A'),
        chunk('a-sigue', 'A'),
        chunk('d-tabla', 'D'),
      ]).map((source) => source.chunkId),
    ).toEqual(['a1', 'b1', 'a2', 'a-tabla', 'a-sigue', 'c1', 'd-tabla']);
    expect(delivered.map((source) => source.chunkId)).toEqual([
      'a1',
      'b1',
      'a2',
      'c1',
    ]);
  });
});

describe('isScheduleTable', () => {
  it('distingue una tabla de fechas de un párrafo que menciona algunas', () => {
    expect(isScheduleTable(DESTAQUE_SCHEDULE)).toBe(true);
    // Párrafo real del oficio: tres fechas sueltas en unos 2 400 caracteres.
    const paragraph = `La vigencia del destaque es a partir del 01.03.2026; para directivos, desde el 01 de febrero; la asistencia técnica es el 16 de enero. ${'Las solicitudes se presentan ante la UGEL o DRE de destino conforme al cronograma que se adjunta. '.repeat(24)}`;
    expect(distinctDatesIn(paragraph)).toHaveLength(3);
    expect(isScheduleTable(paragraph)).toBe(false);
    expect(isScheduleTable('Del 13.01.2026 al 14.01.2026.')).toBe(false);
  });
});

describe('contiguousSchedule', () => {
  const candidate = (
    chunkIndex: number,
    chunkContent: string,
  ): DatedCandidate => ({
    chunk: {
      articleReference: null,
      chunkContent,
      chunkId: `chunk-${chunkIndex}`,
      documentId: 'document',
      documentSituation: 'current',
      documentTitle: 'Modificación del cronograma de contratación docente',
      documentVersionId: 'version',
      lexicalScore: 0,
      moduleIds: ['module'],
      moduleNames: ['Contratación'],
      numeralReference: null,
      pageEnd: chunkIndex,
      pageStart: chunkIndex,
      sectionTitle: null,
      semanticScore: 0.7,
      versionNumber: 1,
    },
    chunkIndex,
    dates: distinctDatesIn(chunkContent).length,
    table: isScheduleTable(chunkContent),
    version: 0,
  });
  const table = (from: number) =>
    `Etapa ${from} Publicación ${from}.02.2026 ${from + 1}.02.2026 Evaluación ${from + 2}.02.2026`;
  const prose = (topic: string) =>
    `${topic}: rige desde el 01.03.2026, con asistencia el 16 de enero y comité el 27 de enero. ${'Texto del oficio sin más datos. '.repeat(80)}`;

  it('sigue la tabla partida hacia ambos lados y se detiene en un párrafo', () => {
    const candidates = [
      candidate(1, prose('Encargatura')),
      candidate(2, table(2)),
      candidate(3, table(10)),
      candidate(4, table(18)),
      candidate(5, prose('Contratación docente')),
      candidate(6, table(24)),
    ];
    const seed = candidates[2];

    expect(
      contiguousSchedule([seed], candidates, new Set(['chunk-3']), [
        'contratacion',
      ]).map((chunk) => chunk.chunkId),
    ).toEqual(['chunk-2', 'chunk-4', 'chunk-5']);
  });

  it('incluye la semilla que aún no se entregó', () => {
    const candidates = [candidate(4, table(2)), candidate(5, table(10))];

    expect(
      contiguousSchedule([candidates[0]], candidates, new Set(), [
        'destaque',
      ]).map((chunk) => chunk.chunkId),
    ).toEqual(['chunk-4', 'chunk-5']);
  });
});
