import { placeBlockCitations } from './block-citations';
import type { RetrievedChunk } from './retrieval.gateway';

function chunk(
  overrides: Partial<RetrievedChunk> & { chunkContent: string },
): RetrievedChunk {
  return {
    articleReference: null,
    chunkId: 'chunk-id',
    documentId: 'document-id',
    documentSituation: 'current',
    documentTitle: 'Documento',
    documentVersionId: 'version-id',
    lexicalScore: 0.1,
    moduleIds: ['module-id'],
    moduleNames: ['Módulo'],
    numeralReference: null,
    pageEnd: 1,
    pageStart: 1,
    sectionTitle: null,
    semanticScore: 0.9,
    versionNumber: 1,
    ...overrides,
  };
}

const faq = chunk({
  chunkContent:
    'El destaque puede ser solicitado por docentes nombrados, directivos y especialistas. Su duración mínima es de 30 días y máxima de un año, sin exceder el 31 de diciembre.',
  documentTitle: 'Preguntas frecuentes',
  documentVersionId: 'faq-version',
});
const cronograma = chunk({
  chunkContent:
    'Cronograma del destaque 2026. Presentación de solicitudes de renovación de destaque: 13.01.2026 al 14.01.2026. Aplicación de la ficha de evaluación: 14.01.2026 al 15.01.2026. Resultados de la evaluación: 16.01.2026. Remisión de la documentación a la UGEL/DRE de destino: 19.01.2026.',
  documentTitle: 'Aprobación del cronograma',
  documentVersionId: 'cronograma-version',
});
const sources = [faq, cronograma];

const intro =
  'Según el cronograma de destaque 2026, estas son las fechas principales:';
const bullets = [
  '- Presentación de solicitudes: del 13 al 14 de enero de 2026.',
  '- Aplicación de la ficha de evaluación: del 14 al 15 de enero de 2026.',
  '- Resultados de la evaluación: el 16 de enero de 2026.',
];
const closing =
  'El destaque puede ser solicitado por docentes nombrados, y su duración mínima es de 30 días. [1]';

describe('placeBlockCitations', () => {
  it('sube a la introducción la cita que el modelo dejó tras la última viñeta', () => {
    const answer = [
      intro,
      '',
      bullets[0],
      bullets[1],
      `${bullets[2]} [2]`,
      '',
      closing,
    ].join('\n');

    expect(placeBlockCitations(answer, sources)).toBe(
      [
        'Según el cronograma de destaque 2026, estas son las fechas principales. [2]',
        '',
        ...bullets,
        '',
        closing,
      ].join('\n'),
    );
  });

  it('asigna a una lista sin citas la fuente citada al final que respalda sus fechas', () => {
    const answer = [
      intro,
      ...bullets,
      '',
      'El destaque puede ser solicitado por docentes nombrados, y su duración mínima es de 30 días. [1][2]',
    ].join('\n');

    const placed = placeBlockCitations(answer, sources);

    expect(placed.split('\n')[0]).toBe(
      'Según el cronograma de destaque 2026, estas son las fechas principales. [2]',
    );
    // La prosa final conserva sus citas tal como las escribió el modelo.
    expect(placed.endsWith('30 días. [1][2]')).toBe(true);
  });

  it('prefiere la fuente con más vocabulario del bloque cuando varias contienen sus cifras', () => {
    const generic = chunk({
      chunkContent:
        'Presentación solicitudes 13.01.2026 14.01.2026 ficha evaluación 15.01.2026 resultados 16.01.2026 destaque.',
      documentVersionId: 'generic-version',
    });
    const answer = [intro, ...bullets, '', 'Cierre general. [1][2]'].join('\n');

    expect(
      placeBlockCitations(answer, [generic, cronograma]).split('\n')[0],
    ).toBe(
      'Según el cronograma de destaque 2026, estas son las fechas principales. [2]',
    );
  });

  it('combina dos fragmentos del mismo documento cuando juntos cubren las cifras', () => {
    const first = chunk({
      chunkContent:
        'Cronograma: presentación de solicitudes 13.01.2026 al 14.01.2026.',
      documentVersionId: 'same-version',
    });
    const second = chunk({
      chunkContent: 'Cronograma: resultados de la evaluación 16.01.2026.',
      documentVersionId: 'same-version',
    });
    const answer = [
      'Según el cronograma, estas son las fechas:',
      '- Presentación de solicitudes: del 13 al 14 de enero de 2026.',
      '- Resultados de la evaluación: el 16 de enero de 2026. [1][2]',
    ].join('\n');

    expect(placeBlockCitations(answer, [first, second]).split('\n')[0]).toBe(
      'Según el cronograma, estas son las fechas. [1][2]',
    );
  });

  it('no toca una lista cuya introducción ya lleva cita', () => {
    const answer = [
      'Según el cronograma, estas son las fechas principales. [2]',
      ...bullets,
    ].join('\n');

    expect(placeBlockCitations(answer, sources)).toBe(answer);
  });

  it('respeta las listas con una cita por elemento', () => {
    const answer = [
      intro,
      `${bullets[0]} [2]`,
      `${bullets[1]} [2]`,
      `${bullets[2]} [2]`,
    ].join('\n');

    expect(placeBlockCitations(answer, sources)).toBe(answer);
  });

  it('no atribuye la lista a una fuente que no contiene sus cifras', () => {
    const answer = [intro, ...bullets, '', closing].join('\n');

    // Solo [1] se cita en la respuesta y no contiene las fechas del cronograma.
    expect(placeBlockCitations(answer, sources)).toBe(answer);
  });

  it('deja la lista como estaba si ninguna fuente respalda todas sus cifras', () => {
    const answer = [
      intro,
      ...bullets,
      '- Entrega del informe: el 30 de marzo de 2026.',
      '',
      'Cierre. [2]',
    ].join('\n');

    expect(placeBlockCitations(answer, sources)).toBe(answer);
  });

  it('no asigna fuente a una lista sin cifras que el modelo no citó', () => {
    const answer = [
      'Estos son los requisitos:',
      '- Ser docente nombrado.',
      '- Contar con evaluación vigente.',
      '',
      'Cierre. [1][2]',
    ].join('\n');

    expect(placeBlockCitations(answer, sources)).toBe(answer);
  });

  it('reubica la cita de la última viñeta aunque la lista no tenga cifras', () => {
    const answer = [
      'Estos son los requisitos del destaque:',
      '- Ser docente nombrado.',
      '- Presentar la solicitud como especialista. [1]',
    ].join('\n');

    expect(placeBlockCitations(answer, sources)).toBe(
      [
        'Estos son los requisitos del destaque. [1]',
        '- Ser docente nombrado.',
        '- Presentar la solicitud como especialista.',
      ].join('\n'),
    );
  });

  it('no sube la cita de la última viñeta si otra viñeta no comparte vocabulario con la fuente', () => {
    const answer = [
      'Estos son los requisitos del destaque:',
      '- Tener título pedagógico.',
      '- Contar con buena salud.',
      '- Ser docente nombrado. [1]',
    ].join('\n');

    expect(placeBlockCitations(answer, sources)).toBe(answer);
  });

  it('exige la fecha completa: un mes distinto no la respalda aunque los días coincidan', () => {
    const answer = [
      intro,
      '- Presentación de solicitudes: del 13 al 14 de febrero de 2026.',
      '- Resultados de la evaluación: el 5 de marzo de 2026.',
      '',
      'Cierre. [1][2]',
    ].join('\n');

    expect(placeBlockCitations(answer, sources)).toBe(answer);
  });

  it('acepta la fecha escrita con letras en la fuente', () => {
    const spelled = chunk({
      chunkContent:
        'Cronograma del destaque 2026: presentación de solicitudes del 13 de enero de 2026 al 14 de enero de 2026.',
      documentVersionId: 'spelled-version',
    });
    const answer = [
      'Según el cronograma de destaque 2026, estas son las fechas:',
      '- Presentación de solicitudes: del 13 al 14 de enero de 2026. [1]',
    ].join('\n');

    expect(placeBlockCitations(answer, [spelled]).split('\n')[0]).toBe(
      'Según el cronograma de destaque 2026, estas son las fechas. [1]',
    );
  });

  it('conserva en la viñeta las citas que no respaldan el bloque', () => {
    const answer = [
      'Duración del destaque:',
      '- Mínima de 30 días.',
      '- Máxima de un año. [1][2]',
    ].join('\n');

    // [2] (cronograma) no trae «30»: solo [1] sube a la introducción y la
    // viñeta no pierde ninguna de sus citas originales.
    expect(placeBlockCitations(answer, sources)).toBe(
      [
        'Duración del destaque. [1]',
        '- Mínima de 30 días.',
        '- Máxima de un año. [1][2]',
      ].join('\n'),
    );
  });

  it('no cuenta un año como vocabulario compartido de una viñeta', () => {
    const answer = [
      'Para la renovación del destaque 2026:',
      '- Publicación de plazas vacantes en 2026.',
      '- Resultados de la evaluación: el 16 de enero de 2026. [2]',
    ].join('\n');

    expect(placeBlockCitations(answer, sources)).toBe(answer);
  });

  it('no sube la cita si el bloque menciona un mes fuera de una fecha completa', () => {
    const answer = [
      intro,
      ...bullets,
      '- Inicio del proceso en enero.',
      '',
      'Cierre. [2]',
    ].join('\n');

    expect(placeBlockCitations(answer, sources)).toBe(answer);
  });

  it('comprueba el mes aunque la fecha se escriba con «del» antes del año', () => {
    const answer = [
      intro,
      '- Presentación de solicitudes: del 13 al 14 de febrero del 2026.',
      '- Resultados de la evaluación: el 16 de febrero del 2026.',
      '',
      'Cierre. [1][2]',
    ].join('\n');

    expect(placeBlockCitations(answer, sources)).toBe(answer);
  });

  it('une un periodo que cruza de año y reconoce el día con cero de la fuente', () => {
    const validity = chunk({
      chunkContent:
        'Vigencia del cronograma: 30.12.2025 y 05 de enero de 2026.',
    });
    const answer = [
      'Según el cronograma, estas son las fechas:',
      '- Vigencia del cronograma: del 30 de diciembre de 2025 al 5 de enero de 2026. [1]',
    ].join('\n');

    expect(placeBlockCitations(answer, [validity]).split('\n')[0]).toBe(
      'Según el cronograma, estas son las fechas. [1]',
    );
  });

  it('acepta «setiembre» y comprueba su mes', () => {
    const closing = chunk({
      chunkContent: 'Cierre del cronograma: 15.09.2026.',
    });
    const other = chunk({ chunkContent: 'Cierre del cronograma: 15.10.2026.' });
    const answer = [
      'Según el cronograma, estas son las fechas:',
      '- Cierre del cronograma: el 15 de setiembre de 2026. [1]',
    ].join('\n');

    expect(placeBlockCitations(answer, [closing]).split('\n')[0]).toBe(
      'Según el cronograma, estas son las fechas. [1]',
    );
    expect(placeBlockCitations(answer, [other])).toBe(answer);
  });

  it('deja intacto un rótulo en negrita y pone la cita después', () => {
    const answer = [
      '**Duración del destaque**:',
      '- Mínima de 30 días.',
      '- Máxima de un año. [1]',
    ].join('\n');

    expect(placeBlockCitations(answer, sources)).toBe(
      [
        '**Duración del destaque**: [1]',
        '- Mínima de 30 días.',
        '- Máxima de un año.',
      ].join('\n'),
    );
  });

  it('conserva los años entre corchetes que no son citas', () => {
    const law = chunk({
      chunkContent:
        'Los docentes nombrados cumplen la Ley N.° 29944 [2012] y los especialistas también.',
    });
    const answer = [
      'Estos son los requisitos del docente nombrado:',
      '- Ser docente nombrado.',
      '- Cumplir la Ley N.° 29944 [2012] como especialista. [1]',
    ].join('\n');

    expect(placeBlockCitations(answer, [law])).toBe(
      [
        'Estos son los requisitos del docente nombrado. [1]',
        '- Ser docente nombrado.',
        '- Cumplir la Ley N.° 29944 [2012] como especialista.',
      ].join('\n'),
    );
  });

  it('normaliza los saltos de línea CRLF al reubicar la cita', () => {
    const answer = [intro, bullets[0], `${bullets[2]} [2]`].join('\r\n');

    expect(placeBlockCitations(answer, sources)).toBe(
      [
        'Según el cronograma de destaque 2026, estas son las fechas principales. [2]',
        bullets[0],
        bullets[2],
      ].join('\n'),
    );
  });

  it('procesa cada lista por separado y conserva las citas que no respaldan el bloque', () => {
    const answer = [
      'Para la renovación del destaque:',
      '- Presentación de solicitudes: del 13 al 14 de enero de 2026.',
      '- Resultados de la evaluación: el 16 de enero de 2026. [2]',
      '',
      'Duración del destaque:',
      '- Mínima de 30 días.',
      '- Máxima de un año. [1][2]',
    ].join('\n');

    expect(placeBlockCitations(answer, sources)).toBe(
      [
        'Para la renovación del destaque. [2]',
        '- Presentación de solicitudes: del 13 al 14 de enero de 2026.',
        '- Resultados de la evaluación: el 16 de enero de 2026.',
        '',
        'Duración del destaque. [1]',
        '- Mínima de 30 días.',
        '- Máxima de un año. [1][2]',
      ].join('\n'),
    );
  });

  it('admite una lista con rótulos en negrita y sublistas', () => {
    const answer = [
      'Las fechas clave son las siguientes:',
      '',
      '- **Renovación de destaque**:',
      '  - Presentación de solicitudes: del 13 al 14 de enero de 2026.',
      '  - Resultados de la evaluación: el 16 de enero de 2026. [2]',
    ].join('\n');

    expect(placeBlockCitations(answer, sources).split('\n')[0]).toBe(
      'Las fechas clave son las siguientes. [2]',
    );
  });

  it('no coloca citas en la pregunta de cierre ni en los títulos', () => {
    const answer = [
      '## Fechas',
      ...bullets,
      '',
      '¿Quieres saber más sobre las fechas?',
      '- Sí. [2]',
    ].join('\n');

    expect(placeBlockCitations(answer, sources)).toBe(answer);
  });

  it('no modifica las tablas ni las respuestas sin citas válidas', () => {
    const table = [
      intro,
      '| Actividad | Fecha |',
      '|---|---|',
      '| Resultados | 16 de enero de 2026 [2] |',
    ].join('\n');

    expect(placeBlockCitations(table, sources)).toBe(table);
    expect(placeBlockCitations([intro, ...bullets].join('\n'), sources)).toBe(
      [intro, ...bullets].join('\n'),
    );
    expect(placeBlockCitations('Texto [9].', sources)).toBe('Texto [9].');
    expect(placeBlockCitations('Texto [1].', [])).toBe('Texto [1].');
  });
});
