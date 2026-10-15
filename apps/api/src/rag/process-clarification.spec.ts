import {
  causalClarificationFor,
  causalsInEvidence,
  causalsInQuestion,
} from './process-clarification';
import type { RetrievedChunk } from './retrieval.gateway';

function chunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    articleReference: null,
    chunkContent:
      'Para la reasignación por salud se presenta la solicitud con el informe médico.',
    chunkId: 'chunk-1',
    documentId: 'document-1',
    documentSituation: 'current',
    documentTitle: 'Norma interna',
    documentVersionId: 'version-1',
    issuanceYear: 2025,
    lexicalScore: 0.3,
    moduleIds: ['module-a'],
    moduleNames: ['Módulo A'],
    numeralReference: null,
    pageEnd: 1,
    pageStart: 1,
    sectionTitle: null,
    semanticScore: 0.7,
    versionNumber: 1,
    ...overrides,
  };
}

const SALUD = chunk({
  chunkContent:
    'La reasignación por salud requiere el informe médico del establecimiento.',
});
const EMERGENCIA = chunk({
  chunkContent:
    'La reasignación por emergencia se acredita con la declaratoria correspondiente.',
  chunkId: 'chunk-2',
  documentVersionId: 'version-2',
});
const VIOLENCIA = chunk({
  chunkContent:
    'La reasignación por violencia familiar se sustenta con la denuncia o medida de protección.',
  chunkId: 'chunk-3',
  documentVersionId: 'version-3',
});

describe('causalsInQuestion', () => {
  it('reconoce la causal escrita, con o sin tildes', () => {
    expect(
      causalsInQuestion('¿Qué piden para la reasignación por salud?'),
    ).toEqual(['salud']);
    expect(
      causalsInQuestion('Reasignación por interes personal: requisitos'),
    ).toEqual(['interes-personal']);
  });

  it('no confunde el tema general con una causal', () => {
    expect(
      causalsInQuestion('¿Cuáles son los requisitos de la reasignación?'),
    ).toEqual([]);
  });
});

describe('causalsInEvidence', () => {
  it('lista las causales distintas que la evidencia distingue', () => {
    expect(causalsInEvidence([SALUD, EMERGENCIA, VIOLENCIA])).toEqual([
      'salud',
      'emergencia',
      'violencia',
    ]);
  });

  it('no repite la causal presente en varias fuentes', () => {
    expect(causalsInEvidence([SALUD, SALUD])).toEqual(['salud']);
  });
});

describe('causalClarificationFor', () => {
  it('pide la causal cuando la consulta es general y la evidencia se divide por causal', () => {
    const clarification = causalClarificationFor(
      '¿Cuáles son los requisitos de la reasignación?',
      [SALUD, EMERGENCIA],
    );

    expect(clarification?.message).toContain('motivo');
    expect(clarification?.message).toContain('salud');
    expect(clarification?.message).toContain('emergencia');
    // Una sola pregunta: la causal que decide el trámite.
    expect(clarification?.message.match(/\?/gu)).toHaveLength(1);
  });

  it('no pregunta cuando la consulta ya nombra su causal', () => {
    expect(
      causalClarificationFor('¿Qué piden para la reasignación por salud?', [
        SALUD,
        EMERGENCIA,
      ]),
    ).toBeNull();
  });

  it('no pregunta cuando la evidencia no se divide por causal', () => {
    expect(
      causalClarificationFor('¿Cuáles son los requisitos de la reasignación?', [
        SALUD,
      ]),
    ).toBeNull();
  });

  it('no pregunta en un trámite que no depende de la causal', () => {
    expect(
      causalClarificationFor('¿Cuáles son los requisitos de la licencia?', [
        SALUD,
        EMERGENCIA,
      ]),
    ).toBeNull();
  });

  it('no pregunta cuando la consulta legítima no menciona el proceso', () => {
    // «¿Quién aprueba la norma de auxiliares de educación 2026?» no debe
    // recibir una aclaración de causal aunque la evidencia recuperada mencione
    // reasignaciones por distintos motivos.
    expect(
      causalClarificationFor(
        '¿Quién aprueba la norma de auxiliares de educación 2026?',
        [SALUD, EMERGENCIA],
      ),
    ).toBeNull();
  });

  // Hallazgo del cross-review: lo que la persona escribió manda. Si nombra la
  // norma exacta, la consulta no es general y corresponde responderla con ese
  // documento en lugar de interrumpir el turno con una pregunta.
  it('no pregunta cuando la consulta identifica expresamente una norma', () => {
    expect(
      causalClarificationFor(
        'Según la RM N.° 123-2024-MINEDU, ¿cuáles son los requisitos de la reasignación?',
        [SALUD, EMERGENCIA],
      ),
    ).toBeNull();
    expect(
      causalClarificationFor(
        '¿Qué plazo tiene la reasignación según la RSG N.° 326-2017-MINEDU?',
        [SALUD, EMERGENCIA],
      ),
    ).toBeNull();
    expect(
      causalClarificationFor('¿Qué dice la Ley 29944 sobre la reasignación?', [
        SALUD,
        EMERGENCIA,
      ]),
    ).toBeNull();
  });
});
