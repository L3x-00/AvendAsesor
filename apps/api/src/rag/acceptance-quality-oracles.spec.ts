import {
  assessStability,
  citationsPointToKnownSources,
  corpusSnapshotKey,
  decideVerdict,
  integrityIssues,
  isCausalClarification,
  isSalaryClarification,
  markdownTables,
  noEvidenceIsSafe,
  pdfMinuteRequestIsCorrect,
  salary2025TableMatchesControl,
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
  it('detecta cambios de corpus durante campaña sin confundir orden o timestamp', () => {
    expect(
      corpusSnapshotKey({
        ...corpus,
        capturedAt: 'otro instante',
        activeRootModules: [...corpus.activeRootModules].reverse(),
      }),
    ).toBe(corpusSnapshotKey(corpus));
    expect(
      corpusSnapshotKey({
        ...corpus,
        documents: corpus.documents.map((doc) => ({ ...doc, pageCount: 100 })),
      }),
    ).not.toBe(corpusSnapshotKey(corpus));
  });
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
      noEvidenceIsSafe({ ...exact, answer: message.replace('RSG ', 'DS ') }),
    ).toBe(false);
    expect(
      noEvidenceIsSafe({
        ...exact,
        question: 'Resolución de Secretaría General N.° 326-2017-MINEDU',
      }),
    ).toBe(true);
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
    expect(salary2025TableMatchesControl(salaryTable())).toBe(true);
    expect(salary2025TableMatchesControl(salaryTable('3300.60'))).toBe(true);
    expect(salary2025TableMatchesControl(salaryTable('3,300.60'))).toBe(true);
    expect(salary2025TableMatchesControl(salaryTable('3.300,60'))).toBe(true);
    for (const amount of [
      '3 300',
      '3 300,00',
      '2 000,10',
      '2 666,80',
      '3 300,60 o 2 000,10',
      '-3300.60',
      '−3300.60',
      '3300.60 o 2000 soles',
    ]) {
      expect(salary2025TableMatchesControl(salaryTable(amount))).toBe(false);
    }
    expect(
      salary2025TableMatchesControl({
        ...salaryTable(),
        sources: [{ ...source, issuanceYear: 2023 }],
      }),
    ).toBe(false);
    expect(
      salary2025TableMatchesControl({
        ...salaryTable(),
        answer: salaryTable().answer.replace(
          'S/ 3 300,60',
          'No es S/ 3 300,60',
        ),
      }),
    ).toBe(false);
  });
  it('el monto de control no absuelve prosa contradictoria ni factores de otra persona', () => {
    const valid = salaryTable();
    for (const answer of [
      valid.answer + '\nEl sueldo es S/ 2000,10.',
      valid.answer + '\nTu sueldo es 2000 soles.',
      valid.answer.replace(
        '| 2025 | 30 horas |',
        '| Auxiliar nombrado 2025 | 40 horas |',
      ),
      valid.answer.replace('| 2025 | 30 horas |', '| 2025 | 40 |'),
    ])
      expect(salary2025TableMatchesControl({ ...valid, answer })).toBe(false);
  });
  it('ninguna coincidencia técnica certifica prosa salarial abierta ni sus repeticiones', () => {
    for (const answer of [
      salaryTable().answer,
      salaryTable().answer + '\nTu jornada aplicable es de 36 horas.',
      salaryTable().answer + '\nTu jornada aplicable es de 40 h.',
      salaryTable().answer +
        '\nEl monto corresponde a los profesores nombrados.',
      salaryTable().answer.replace('| 2025 |', '| 2024 |'),
      salaryTable().answer.replace(
        'Docente contratado',
        'Directora contratada',
      ),
    ]) {
      for (const id of ['O03', 'O03-R2'])
        expect(
          decideVerdict({
            id,
            turns: [turn({ answer })],
            corpus,
            pass: true,
            otherwise: 'FALLA',
          }).verdict,
        ).toBe('REQUIERE_REVISION');
    }
  });
  it('la presentación exige la clasificación de grilla real, además de citas conocidas', () => {
    expect(
      tableRowsHaveKnownCitations({
        ...salaryTable('3300.60', '1, 2'),
        sources: [source, { ...source, rank: 2 }],
      }),
    ).toBe(false);
    expect(
      tableRowsHaveKnownCitations({
        ...salaryTable(),
        answer: salaryTable().answer.replace('[1]', '[1][2]'),
        sources: [source, { ...source, rank: 2 }],
      }),
    ).toBe(true);
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
    ).toEqual(expect.arrayContaining([expect.stringContaining('canónico')]));
    expect(
      integrityIssues(
        turn({ sources: [{ ...source, pageCount: Number.NaN }] }),
        corpus,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Paginación incoherente'),
      ]),
    );
  });
  it('contrasta identidad, año, MIME y total con el documento canónico', () => {
    for (const changed of [
      { title: 'Decreto Supremo N.° 036-2023-EF' },
      { issuanceYear: 2023 },
      { mimeType: 'text/plain' },
      { page: 99, pageEnd: 99, pageCount: 100 },
    ])
      expect(
        integrityIssues(turn({ sources: [{ ...source, ...changed }] }), corpus),
      ).toEqual(expect.arrayContaining([expect.stringContaining('canónico')]));
    expect(
      integrityIssues(
        turn({
          sources: [{ ...source, page: 99, pageEnd: 99, pageCount: null }],
        }),
        corpus,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Paginación incoherente'),
      ]),
    );
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
    expect(
      isSalaryClarification({
        ...clarification,
        answer:
          'El sueldo del sector público es de 9000 soles al mes. ¿Cuál es tu jornada?',
      }),
    ).toBe(false);
  });
  it('rechaza casos sin turnos, turnos vacíos y rangos de cita inválidos', () => {
    expect(
      integrityIssues(
        turn({ answer: 'Hola.', events: ['conversational'], sources: [] }),
        corpus,
      ),
    ).toEqual([]);
    expect(integrityIssues(turn({ events: ['token'] }), corpus)).not.toEqual(
      [],
    );
    expect(
      decideVerdict({
        id: 'C01',
        turns: [],
        corpus,
        pass: true,
        otherwise: 'FALLA',
      }).verdict,
    ).toBe('FALLA');
    expect(integrityIssues(turn({ answer: '' }), corpus)).not.toEqual([]);
    expect(
      integrityIssues(turn({ sources: [{ ...source, rank: 0 }] }), corpus),
    ).not.toEqual([]);
  });
  it('usa un único contrato de página y minuto sin aceptar una mención vacía', () => {
    expect(
      pdfMinuteRequestIsCorrect(
        turn({ answer: 'El documento PDF usa páginas como referencia' }),
      ),
    ).toBe(false);
    expect(
      pdfMinuteRequestIsCorrect(
        turn({
          answer:
            'Los documentos PDF se ubican por página, no por minuto: no puedo darte una marca de minuto.',
        }),
      ),
    ).toBe(true);
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
      turns: [
        {
          ...salaryTable(),
          answer: salaryTable().answer + '\nOtra redacción.',
        },
      ],
    };
    expect(assessStability([first, repeated])[0]).toMatchObject({
      stable: true,
      allPass: true,
      runs: 2,
    });
    expect(
      assessStability([first, { ...repeated, verdict: 'FALLA' }])[0].stable,
    ).toBe(false);
    expect(
      assessStability([
        first,
        { ...repeated, turns: [salaryTable('2000,10')] },
      ])[0].stable,
    ).toBe(false);
    expect(
      assessStability([
        first,
        {
          ...repeated,
          turns: [{ ...salaryTable(), sources: [{ ...source, page: 2 }] }],
        },
      ])[0].stable,
    ).toBe(false);
  });
});
