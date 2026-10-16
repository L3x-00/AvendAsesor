import {
  assessStability,
  citationsPointToKnownSources,
  decideVerdict,
  integrityIssues,
  isCausalClarification,
  isSalaryClarification,
  markdownTables,
  noEvidenceIsSafe,
  salary2025TableIsCorrect,
  tableRowsAreNewestFirst,
  tableRowsHaveKnownCitations,
  type CorpusSnapshot,
  type QualitySource,
  type QualityTurn,
} from '../../test/acceptance/quality-oracles';

const source: QualitySource = {
  documentId: 'document-2025',
  documentVersionId: 'version-2025',
  issuanceYear: 2025,
  mimeType: 'application/pdf',
  moduleName: 'Remuneraciones',
  page: 3,
  pageEnd: 3,
  pageCount: 4,
  rank: 1,
  relatedModuleName: 'Remuneraciones',
  title: 'Decreto Supremo N.° 049-2025-EF',
  articleReference: null,
  numeralReference: null,
  sectionTitle: null,
};
const corpus: CorpusSnapshot = {
  capturedAt: '2026-10-16T00:00:00.000Z',
  activeRootModules: ['Remuneraciones', 'Ley y reglamento'],
  documents: [
    {
      id: source.documentId,
      versionId: source.documentVersionId,
      title: source.title,
      issuanceYear: 2025,
      resolutionNumber: '049-2025-EF',
      documentType: 'DECRETO_SUPREMO',
      mimeType: 'application/pdf',
      moduleNames: ['Remuneraciones'],
      moduleIds: ['salary'],
      originalFileName: '049.pdf',
      pageCount: 4,
      sectionTitles: [],
    },
  ],
};
function turn(overrides: Partial<QualityTurn> = {}): QualityTurn {
  return {
    answer: 'Monto 2025 para 30 horas. [1]',
    events: ['token', 'sources', 'done'],
    question: 'Sueldo docente contratado de 30 horas en 2025',
    sources: [source],
    ...overrides,
  };
}
const negative =
  'Por ahora no encontré información suficiente para orientarte bien sobre esto. Cuéntame el trámite, tu cargo y qué necesitas resolver para buscar una respuesta más precisa.';
const denied = () =>
  turn({ answer: negative, events: ['no_evidence', 'done'], sources: [] });
const salaryTable = (amount = '3 300,60', rank = '1') =>
  turn({
    answer: `Docente contratado, 30 horas, año 2025.\n\n| Año | Jornada | Monto | Cita |\n| --- | --- | --- | --- |\n| 2025 | 30 horas | S/ ${amount} | [${rank}] |`,
  });

describe('oráculos de calidad — contramuestras OBS-020', () => {
  it('no aprueba texto factual después de una negativa correcta (OBS-001)', () => {
    expect(noEvidenceIsSafe(denied())).toBe(true);
    expect(
      noEvidenceIsSafe({
        ...denied(),
        answer: negative + ' La sanción es una amonestación escrita.',
      }),
    ).toBe(false);
    expect(
      noEvidenceIsSafe({
        ...denied(),
        events: ['token', 'no_evidence', 'done'],
      }),
    ).toBe(false);
  });
  it('acepta la negativa exacta por norma ausente, sin prestar contenido ajeno (OBS-023)', () => {
    const message =
      'No encontré evidencia disponible y aprobada de RSG 326-2017-MINEDU. Para no atribuirle contenido de otra norma, no usaré documentos parecidos como sustituto. Verifica el número indicado o vuelve a consultar cuando el documento esté disponible.';
    const exact = {
      ...denied(),
      answer: message,
      question: 'RSG 326-2017-MINEDU',
    };
    expect(noEvidenceIsSafe(exact)).toBe(true);
    expect(
      noEvidenceIsSafe({ ...exact, question: 'RSG 121-2018-MINEDU' }),
    ).toBe(false);
    expect(
      noEvidenceIsSafe({
        ...exact,
        answer: message + ' Debes presentar tu DNI.',
      }),
    ).toBe(false);
  });
  it('no transforma un fallo de recuperación con corpus en REQUIERE_CORPUS', () => {
    const result = decideVerdict({
      id: 'C17',
      turns: [denied()],
      corpus,
      pass: false,
      otherwise: 'REQUIERE_CORPUS',
    });
    expect(result.verdict).toBe('FALLA');
  });
  it('solo permite REQUIERE_CORPUS por inventario previo vacío, no por la respuesta', () => {
    const result = decideVerdict({
      id: 'PI-01',
      turns: [denied()],
      corpus,
      pass: false,
      otherwise: 'FALLA',
    });
    expect(result.verdict).toBe('REQUIERE_CORPUS');
    expect(result.issues[0]).toContain('inventario');
  });
  it('un error técnico nunca se oculta como falta de corpus', () => {
    expect(
      decideVerdict({
        id: 'PI-01',
        turns: [{ ...denied(), error: 'provider unavailable' }],
        corpus,
        pass: false,
        otherwise: 'REQUIERE_CORPUS',
      }).verdict,
    ).toBe('FALLA');
  });
  it('un corpus ausente tampoco disculpa una respuesta inventada con fuentes de otro tema', () => {
    expect(
      decideVerdict({
        id: 'PI-01',
        turns: [turn()],
        corpus,
        pass: true,
        otherwise: 'REQUIERE_CORPUS',
      }).verdict,
    ).toBe('FALLA');
  });
  it('acepta citas agrupadas válidas y rechaza una inventada junto a otra correcta', () => {
    expect(citationsPointToKnownSources(turn({ answer: 'Dato [1, 1].' }))).toBe(
      true,
    );
    expect(citationsPointToKnownSources(turn({ answer: 'Dato [1, 7].' }))).toBe(
      false,
    );
    expect(tableRowsHaveKnownCitations(salaryTable('3 300,60', '1, 7'))).toBe(
      false,
    );
  });
  it('usa el parser actual: tabla de 5 columnas y 9 filas, no el límite obsoleto (OBS-005/006)', () => {
    const answer = [
      '| Modalidad | Nivel | Jornada | Monto | Cita |',
      '| --- | --- | --- | --- | --- |',
      ...Array.from(
        { length: 9 },
        () => '| EBR | Secundaria | 30 | 3 300,60 | [1] |',
      ),
    ].join('\n');
    expect(markdownTables(answer)[0].rows).toHaveLength(9);
    expect(tableRowsHaveKnownCitations(turn({ answer }))).toBe(true);
  });
  it('no hereda a todas las filas una cita situada solo al final de la tabla', () => {
    const answer =
      '| Año | Monto |\n| --- | --- |\n| 2025 | 3300,60 |\n| 2023 | 2000,10 |\n\n[1]';
    expect(tableRowsHaveKnownCitations(turn({ answer }))).toBe(false);
  });
  it('el monto correcto requiere decimales exactos y la fuente aplicable (OBS-002/011)', () => {
    expect(salary2025TableIsCorrect(salaryTable())).toBe(true);
    expect(salary2025TableIsCorrect(salaryTable('3300.60'))).toBe(true);
    expect(salary2025TableIsCorrect(salaryTable('3,300.60'))).toBe(true);
    expect(salary2025TableIsCorrect(salaryTable('3.300,60'))).toBe(true);
    for (const amount of [
      '3 300',
      '3 300,00',
      '2 000,10',
      '2 666,80',
      '3 300,60 o 2 000,10',
    ]) {
      expect(salary2025TableIsCorrect(salaryTable(amount))).toBe(false);
    }
    expect(
      salary2025TableIsCorrect({
        ...salaryTable(),
        sources: [{ ...source, issuanceYear: 2023 }],
      }),
    ).toBe(false);
    expect(
      salary2025TableIsCorrect({
        ...salaryTable(),
        answer: salaryTable().answer.replace(
          'S/ 3 300,60',
          'No es S/ 3 300,60',
        ),
      }),
    ).toBe(false);
  });
  it('página final y total deben ser coherentes incluso si el inicio parece válido (OBS-008)', () => {
    expect(integrityIssues(turn(), corpus)).toEqual([]);
    expect(
      integrityIssues(
        turn({ sources: [{ ...source, page: 3, pageEnd: 5 }] }),
        corpus,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Paginación incoherente'),
      ]),
    );
    expect(
      integrityIssues(
        turn({ sources: [{ ...source, pageCount: null }] }),
        corpus,
      ),
    ).toEqual([]);
    expect(
      integrityIssues(
        turn({ sources: [{ ...source, pageCount: Number.NaN }] }),
        corpus,
      ),
    ).toHaveLength(1);
  });
  it('no acepta una versión ajena al inventario aunque el título sea igual', () => {
    expect(
      integrityIssues(
        turn({ sources: [{ ...source, documentVersionId: 'other-version' }] }),
        corpus,
      ),
    ).toEqual(expect.arrayContaining([expect.stringContaining('inventario')]));
  });
  it('distingue un título jurídico de la cabecera del diario (OBS-024)', () => {
    expect(
      integrityIssues(
        turn({
          sources: [
            {
              ...source,
              sectionTitle: 'Artículo 3.- Publicación en El Peruano',
            },
          ],
        }),
        corpus,
      ),
    ).toEqual([]);
    expect(
      integrityIssues(
        turn({
          sources: [
            { ...source, sectionTitle: '7 NORMAS LEGALES Jueves 20 de marzo' },
          ],
        }),
        corpus,
      ),
    ).toEqual(expect.arrayContaining([expect.stringContaining('Cabecera')]));
  });
  it('el orden temporal no puede usar años ausentes o una fila antigua primero (OBS-010)', () => {
    const old = { ...source, rank: 2, issuanceYear: 2023 };
    const answer =
      '| Año | Dato |\n| --- | --- |\n| 2025 | Dato [1] |\n| 2023 | Dato [2] |';
    const ordered = turn({ answer, sources: [source, old] });
    expect(tableRowsAreNewestFirst(ordered)).toBe(true);
    expect(
      tableRowsAreNewestFirst({
        ...ordered,
        answer: answer.replace(
          '| 2025 | Dato [1] |\n| 2023 | Dato [2] |',
          '| 2023 | Dato [2] |\n| 2025 | Dato [1] |',
        ),
      }),
    ).toBe(false);
    expect(
      tableRowsAreNewestFirst({
        ...ordered,
        sources: [source, { ...old, issuanceYear: null }],
      }),
    ).toBe(false);
  });
  it('pedir causal o sector es válido sin exponer una cifra o evidencia especial (OBS-013/015)', () => {
    const clarification = turn({
      events: ['clarification', 'done'],
      sources: [],
      answer: 'Los requisitos cambian por motivo. ¿Cuál es la causal?',
    });
    expect(isCausalClarification(clarification)).toBe(true);
    expect(isCausalClarification({ ...clarification, sources: [source] })).toBe(
      false,
    );
    expect(
      isSalaryClarification({
        ...clarification,
        answer: '¿Tu consulta es del sector público o privado?',
      }),
    ).toBe(true);
    expect(
      isSalaryClarification({
        ...clarification,
        answer: 'S/ 3300,60. ¿Tu consulta es del sector público o privado?',
      }),
    ).toBe(false);
  });
  it('la estabilidad mide resultado y fuentes, sin exigir redacción idéntica (OBS-020)', () => {
    const first = {
      id: 'O03',
      verdict: 'PASA' as const,
      turns: [salaryTable()],
    };
    const repeated = {
      ...first,
      id: 'O03-R2',
      turns: [{ ...salaryTable(), answer: 'Otra redacción [1]' }],
    };
    expect(assessStability([first, repeated])[0]).toMatchObject({
      stable: true,
      allPass: true,
      runs: 2,
    });
    expect(
      assessStability([first, { ...repeated, verdict: 'FALLA' }])[0].stable,
    ).toBe(false);
  });
});
