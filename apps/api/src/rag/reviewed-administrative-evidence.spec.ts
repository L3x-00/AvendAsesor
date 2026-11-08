import manifests from './evidence/reviewed-administrative.json';
import fixtures from './fixtures/reviewed-administrative.json';
import type { RetrievedChunk } from './retrieval.gateway';
import {
  reviewedAdministrativeAnswer,
  reviewedAdministrativeContext,
} from './reviewed-administrative-evidence';

function sourcesFor(intent: keyof typeof manifests): RetrievedChunk[] {
  const manifest = manifests[intent];
  return manifest.required.map(
    ({ chunkId, chunkIndex, pageStart, pageEnd }) => ({
      articleReference: null,
      chunkContent: fixtures[intent].find((chunk) => chunk.id === chunkId)!
        .text,
      chunkId,
      chunkIndex,
      documentId: manifest.documentId,
      documentSituation: 'current',
      documentTitle: 'Fuente del corpus',
      documentVersionId: manifest.versionId,
      lexicalScore: 0,
      moduleIds: [],
      moduleNames: [],
      numeralReference: null,
      pageEnd,
      pageStart,
      sectionTitle: null,
      semanticScore: 0.7,
      versionNumber: 1,
    }),
  );
}

describe('disposiciones administrativas verificadas', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-11-07')));
  afterEach(() => jest.useRealTimers());

  it('P1 conserva requisitos, declaración y vínculo conyugal en sus páginas', () => {
    const result = reviewedAdministrativeAnswer(
      'soy nombrado en huancayo y mi esposa vive en lima, puedo pedir mi cambio para estar con ella',
      sourcesFor('family-reassignment'),
    );
    expect(result?.answer).toMatch(/un \(1\) año/i);
    expect(result?.answer).toMatch(/declaración jurada/i);
    expect(result?.answer).toMatch(/acta de matrimonio/i);
    expect(result?.answer).toMatch(/sanción vigente/i);
    expect(result?.sources.map(({ pageStart }) => pageStart)).toEqual([
      13, 25, 25, 26, 16,
    ]);
  });

  it('P2 separa duración, plazo de trámite e informe institucional', () => {
    const sources = sourcesFor('temporary-placement');
    const result = reviewedAdministrativeAnswer(
      'quiero trabajar solo por un tiempo en otro colegio pero sin perder mi plaza, que tramite hago',
      sources,
    );
    expect(result?.answer).toMatch(
      /duración mínima es de 30 días.*31 de diciembre/i,
    );
    expect(result?.answer).toMatch(/informe de la UGEL o DRE de destino/i);
    expect(result?.answer).toMatch(
      /Trámite y plazo por unidad familiar o salud[\s\S]*procedimiento dura 30 días/i,
    );
    const institutional = reviewedAdministrativeAnswer(
      '¿Cuáles son los requisitos de destaque por necesidad institucional?',
      sources,
    );
    expect(institutional?.answer).toMatch(
      /informe de la UGEL o DRE de destino/i,
    );
    expect(institutional?.answer).not.toMatch(/procedimiento dura 30 días/i);
  });

  it('P9 conserva ambas alternativas para Inicial regular y limita la capacitación a la segunda', () => {
    const sources = sourcesFor('initial-auxiliary-studies');
    const result = reviewedAdministrativeAnswer(
      'quiero postular de auxiliar de inicial este 2026, que estudios necesito',
      sources,
    );
    expect(result?.answer).toMatch(
      /sexto \(VI\) ciclo.*educación inicial.*distinta a inicial;.*cincuenta \(50\) horas/i,
    );
    expect(result?.answer).toMatch(
      /Educación, Psicología o Tecnología Médica/i,
    );
    const special = reviewedAdministrativeAnswer(
      '¿Qué estudios necesito para postular como auxiliar de inicial EBE?',
      sources,
    );
    expect(special?.answer).toMatch(
      /Educación, Psicología o Tecnología Médica/i,
    );
    expect(special?.answer).not.toMatch(/50\) horas/i);
    const regular = reviewedAdministrativeAnswer(
      '¿Qué estudios necesito para postular como auxiliar de inicial EBR, no EBE?',
      sources,
    );
    expect(regular?.answer).toMatch(/50\) horas/i);
    expect(regular?.answer).not.toMatch(/Tecnología Médica/i);
  });

  it('P10 diferencia el plazo de solicitud del período y conserva la medida preventiva', () => {
    const result = reviewedAdministrativeAnswer(
      'soy auxiliar nombrado y quiero intercambiar mi plaza con otra auxiliar de otra ugel, se puede',
      sourcesFor('auxiliary-exchange'),
    );
    expect(result?.answer).toMatch(
      /octubre a noviembre.*hasta la segunda semana del mes de octubre/i,
    );
    expect(result?.answer).toMatch(/medida preventiva/i);
    expect(result?.answer).toMatch(/ambas deben emitir el cese de pago/i);
    expect(result?.sources[0]).toMatchObject({ pageStart: 23, pageEnd: 24 });
  });

  it('P16 distingue graduación de faltas, causal acreditada y excepciones al PAD', () => {
    const result = reviewedAdministrativeAnswer(
      'soy profesor y quiero saber cuando me pueden destituir por una falta',
      sourcesFor('teacher-dismissal'),
    );
    expect(result?.answer).toMatch(/gravedad de la falta.*condiciones/i);
    expect(result?.answer).toMatch(
      /literal f\) del artículo 49.*de acreditarse estos hechos/i,
    );
    expect(result?.answer).toMatch(/destitución automática sin previo PAD/i);
    expect(result?.answer).toMatch(
      /menor de dos \(2\) años.*cese temporal.*igual o mayor a dos \(2\) años.*destitución/i,
    );
    expect(result?.answer).not.toContain('Página 30 de 38');
  });

  it.each([
    [
      'temporary-placement',
      '¿En qué fechas se presentan solicitudes de destaque 2026?',
    ],
    ['temporary-placement', '¿Cómo renuevo mi destaque?'],
    [
      'temporary-placement',
      '¿Cómo solicito destaque por necesidad institucional en lugar de hacerlo por unidad familiar?',
    ],
    [
      'temporary-placement',
      '¿Cómo solicito destaque por necesidad institucional, no por unidad familiar?',
    ],
    ['teacher-dismissal', '¿Qué recurso tiene un profesor destituido?'],
    [
      'initial-auxiliary-studies',
      'Quiero postular como auxiliar administrativo en un colegio de educación inicial en 2026. ¿Qué estudios necesito?',
    ],
    [
      'family-reassignment',
      '¿Cuándo publican las plazas para la reasignación docente por unidad familiar?',
    ],
    [
      'family-reassignment',
      'Soy docente nombrado y quiero pedir la reasignación por unidad familiar para vivir con mi madre, no con mi esposa',
    ],
    [
      'teacher-dismissal',
      '¿Cuándo pueden destituir a un profesor por tardanza reiterada?',
    ],
    [
      'teacher-dismissal',
      '¿En qué casos pueden destituir a un profesor si falta tres días?',
    ],
    [
      'auxiliary-exchange',
      'No quiero permutar, soy auxiliar nombrado y busco una licencia',
    ],
  ] as const)('preserva la ruta específica %s para %s', (intent, question) => {
    expect(
      reviewedAdministrativeContext(question, sourcesFor(intent)),
    ).toBeNull();
  });

  it('rechaza una fuente de otra versión o con texto o páginas alterados', () => {
    const question = 'Soy auxiliar nombrado y quiero permutar mi plaza';
    const [source] = sourcesFor('auxiliary-exchange');
    expect(
      reviewedAdministrativeAnswer(question, [
        { ...source, documentVersionId: 'otra' },
      ]),
    ).toBeNull();
    expect(
      reviewedAdministrativeAnswer(question, [
        { ...source, chunkContent: source.chunkContent + '.' },
      ]),
    ).toBeNull();
    expect(
      reviewedAdministrativeAnswer(question, [{ ...source, pageStart: 1 }]),
    ).toBeNull();
  });

  it('no da por aplicables las preguntas frecuentes de 2026 en una campaña posterior', () => {
    jest.setSystemTime(new Date('2027-01-01'));
    expect(
      reviewedAdministrativeContext(
        '¿Cómo solicito un destaque?',
        sourcesFor('temporary-placement'),
      ),
    ).toBeNull();
    expect(
      reviewedAdministrativeContext(
        '¿Qué estudios necesito para postular como auxiliar de inicial?',
        sourcesFor('initial-auxiliary-studies'),
      ),
    ).toBeNull();
  });
});
