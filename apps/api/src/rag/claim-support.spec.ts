import {
  assessClaimSupport,
  claimNumbersAppearInSources,
} from './claim-support';
import type { RetrievedChunk } from './retrieval.gateway';
import {
  evaluateAnswerCitationQuality,
  hasContradictedCitedClaim,
} from '../chat/chat.service';

const source: RetrievedChunk = {
  articleReference: 'Artículo 20',
  chunkContent: 'La solicitud se presenta ante la institución educativa.',
  chunkId: 'chunk',
  documentId: 'document',
  documentSituation: 'current',
  documentTitle: 'Norma 2026',
  documentVersionId: 'version',
  issuanceYear: 2026,
  lexicalScore: 1,
  moduleIds: [],
  moduleNames: [],
  numeralReference: '6.2',
  pageEnd: 1,
  pageStart: 1,
  resolutionNumber: '049-2025-EF',
  sectionTitle: null,
  semanticScore: 1,
  versionNumber: 1,
};

describe('claim numbers in source content', () => {
  it.each([
    'Para el trámite A:\nEl docente no debe presentar constancia.\nPara el trámite B:\nEl docente debe presentar constancia.',
    'Es falso lo siguiente:\nEl docente no debe presentar constancia.',
    'No. El docente debe presentar constancia.',
    'No, el docente debe presentar constancia.',
    '¿El docente debe presentar constancia?',
    '«El docente debe presentar constancia.»',
    'Solo si existe hospitalización: el docente no debe presentar constancia.',
  ])(
    'does not extract a polarity verdict from an orphaned sentence',
    (content) => {
      expect(
        assessClaimSupport('El docente debe presentar constancia.', {
          ...source,
          chunkContent: content,
        }),
      ).toBe('unknown');
    },
  );
  it.each([
    [
      'El docente no debe presentar constancia de hospitalización.',
      'El docente debe presentar constancia de hospitalización. [1]',
      'contradicted',
    ],
    [
      'El auxiliar puede solicitar licencia.',
      'El auxiliar no puede solicitar licencia. [1]',
      'contradicted',
    ],
    [
      'El docente nunca presenta el original.',
      'El docente presenta el original. [1]',
      'contradicted',
    ],
    [
      'El docente no debe presentar constancia.',
      'El docente no debe presentar constancia. [1]',
      'supported',
    ],
    [
      'El docente no solo debe presentar constancia.',
      'El docente solo debe presentar constancia. [1]',
      'unknown',
    ],
    [
      'El auxiliar debe presentar constancia.',
      'El docente debe presentar constancia. [1]',
      'unknown',
    ],
    [
      'Si existe hospitalización, debe presentar constancia.',
      'Debe presentar constancia. [1]',
      'unknown',
    ],
    [
      'Debe presentar constancia, salvo excepción.',
      'Debe presentar constancia. [1]',
      'unknown',
    ],
    [
      'Puede presentar CITT o certificado.',
      'Debe presentar CITT y certificado. [1]',
      'unknown',
    ],
  ])('keeps scope and polarity explicit: %s', (content, claim, expected) => {
    const evidence = { ...source, chunkContent: content };
    expect(assessClaimSupport(claim, evidence)).toBe(expected);
    expect(hasContradictedCitedClaim(claim, [evidence])).toBe(
      expected === 'contradicted',
    );
  });

  it('reproduces E04 in the complete citation evaluator', () => {
    expect(
      evaluateAnswerCitationQuality(
        'El docente debe presentar constancia de hospitalización. [1]',
        [
          {
            ...source,
            chunkContent:
              'El docente no debe presentar constancia de hospitalización.',
          },
        ],
      ),
    ).toContain('citation_insufficient');
  });
  it('does not pool a lexical bridge and a number across unrelated sources', () => {
    expect(
      evaluateAnswerCitationQuality(
        'La licencia del docente dura 20 días. [1][2]',
        [
          {
            ...source,
            chunkContent:
              'La licencia del docente se solicita ante la institución.',
          },
          {
            ...source,
            chunkId: 'other',
            chunkContent: 'Coste: 20.',
          },
        ],
      ),
    ).toContain('citation_insufficient');
  });
  it.each(['20', '2026', '6.2', '049', '2025'])(
    'does not use metadata as evidence of the number %s',
    (number) => {
      expect(
        claimNumbersAppearInSources(`El plazo es ${number} días.`, [source]),
      ).toBe(false);
    },
  );

  it.each([
    ['El plazo es 20 días.', 'El plazo es 20 días.', true],
    ['El plazo es 20 días.', 'La norma fue emitida en 2026.', false],
    ['El importe es 50 soles.', 'El importe es 150 soles.', false],
    ['El importe es 116,69 soles.', 'El importe es 116,69 soles.', true],
    ['El importe es 116 soles.', 'El importe es 116,69 soles.', false],
    ['La fecha es 13 de enero de 2026.', 'La fecha es 13.01.2026.', true],
  ])('compares complete content numbers: %s', (claim, content, expected) => {
    expect(
      claimNumbersAppearInSources(claim, [
        { ...source, chunkContent: content },
      ]),
    ).toBe(expected);
  });
});
