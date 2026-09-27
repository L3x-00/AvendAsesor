import type { ConsultationCaseSummary } from './consultation-cases.gateway';
import { groupUnansweredCases } from './unanswered-groups';

const modules = [
  { id: 'rem', name: 'Remuneraciones', parentModuleId: null },
  { id: 'esc', name: 'Escala remunerativa', parentModuleId: 'rem' },
  {
    id: 'asi',
    name: 'Asignaciones y bonificaciones',
    parentModuleId: 'rem',
  },
  { id: 'con', name: 'Contratación y desplazamientos', parentModuleId: null },
  { id: 'rea', name: 'Reasignación docente', parentModuleId: 'con' },
];

let sequence = 0;
function item(
  overrides: Partial<ConsultationCaseSummary> = {},
): ConsultationCaseSummary {
  sequence += 1;
  return {
    answerSnapshot: null,
    attachmentCount: 0,
    conversationId: null,
    createdAt: `2026-09-26T10:0${sequence % 10}:00.000Z`,
    detectedModuleId: null,
    detectedModuleName: null,
    detectedSubmoduleId: null,
    detectedSubmoduleName: null,
    id: `case-${sequence}`,
    issueType: 'support_insufficient',
    kind: 'automatic_alert',
    linkedDocumentCount: 0,
    questionSnapshot: null,
    reportReason: null,
    reporterComment: null,
    requestedModuleId: null,
    requestedModuleName: null,
    reviewExcerpt: null,
    sourceCount: 0,
    status: 'pending',
    topRelevanceScore: null,
    totalCount: 0,
    updatedAt: '2026-09-26T10:00:00.000Z',
    ...overrides,
  };
}

describe('groupUnansweredCases', () => {
  it('agrupa por tema aunque la consulta tenga errores de escritura', () => {
    const groups = groupUnansweredCases(
      [
        item({
          questionSnapshot:
            'QUE NEECESITO PARA TENER BUENOS BENEFICIOS EN REMUNERACIONES',
        }),
        item({ questionSnapshot: 'de que trata la renumeracion' }),
        item({
          // Estaba en «Escala remunerativa», pero pregunta por remuneraciones.
          questionSnapshot:
            'en base a "renumreaciones" de que tienes informacion',
          requestedModuleId: 'esc',
        }),
        item({
          createdAt: '2026-09-27T08:00:00.000Z',
          questionSnapshot: 'de que trata la renumeracion',
        }),
        item({
          questionSnapshot: '¿Qué requisitos necesito para una reasignación?',
        }),
      ],
      modules,
    );

    expect(groups[0]).toMatchObject({
      count: 4,
      kind: 'topic',
      latestAt: '2026-09-27T08:00:00.000Z',
      moduleId: 'rem',
      moduleName: 'Remuneraciones',
      parentModuleName: null,
    });
    // Ejemplos distintos, sin repetir la misma consulta.
    expect(groups[0]?.examples).toHaveLength(3);
    expect(groups[1]).toMatchObject({
      count: 1,
      moduleId: 'rea',
      parentModuleName: 'Contratación y desplazamientos',
    });
  });

  it('la ruta detectada por el RAG manda sobre las palabras', () => {
    const [group] = groupUnansweredCases(
      [
        item({
          detectedModuleId: 'rem',
          detectedSubmoduleId: 'asi',
          questionSnapshot: 'algo sobre remuneraciones',
        }),
      ],
      modules,
    );

    expect(group).toMatchObject({ moduleId: 'asi', kind: 'topic' });
  });

  it('separa las preguntas de catálogo y las que no tienen tema', () => {
    const groups = groupUnansweredCases(
      [
        item({ questionSnapshot: 'que documentos tienes disponibles?' }),
        item({ questionSnapshot: 'holaaa prubea del rag' }),
        item({ questionSnapshot: null, requestedModuleId: 'desconocido' }),
        item({
          questionSnapshot: '¿Qué requisitos necesito para tener mayor sueldo?',
        }),
      ],
      modules,
    );

    expect(groups.map((group) => [group.kind, group.count])).toEqual([
      ['unknown', 3],
      ['catalog', 1],
    ]);
    expect(groups[0]?.examples).toEqual([
      'holaaa prubea del rag',
      '¿Qué requisitos necesito para tener mayor sueldo?',
    ]);
  });

  it('usa el tema abierto en pantalla si la consulta no nombra otro', () => {
    const [group] = groupUnansweredCases(
      [
        item({
          questionSnapshot: '¿Y cuál es el plazo?',
          requestedModuleId: 'esc',
        }),
      ],
      modules,
    );

    expect(group).toMatchObject({
      moduleId: 'esc',
      parentModuleName: 'Remuneraciones',
    });
  });

  it('recorta ejemplos largos y limita los casos por grupo', () => {
    const many = Array.from({ length: 55 }, () =>
      item({ questionSnapshot: `remuneraciones ${'x'.repeat(200)}` }),
    );

    const [group] = groupUnansweredCases(many, modules);

    expect(group?.count).toBe(55);
    expect(group?.caseIds).toHaveLength(50);
    expect(group?.examples[0]?.length).toBeLessThanOrEqual(160);
    expect(group?.examples[0]?.endsWith('…')).toBe(true);
  });
});
