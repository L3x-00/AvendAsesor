import {
  ChatCatalogService,
  DOCUMENTS_CACHE_MS,
  FAILED_SUMMARY_CACHE_MS,
  SUMMARY_CACHE_MS,
  SUMMARY_WAIT_MS,
  overviewMessage,
} from './chat-catalog.service';
import type { AvailableDocument } from './chat-catalog.types';
import {
  parseDocumentSummary,
  summaryStaysInSource,
} from './openai-document-summary.gateway';

function document(
  overrides: Partial<AvailableDocument> = {},
): AvailableDocument {
  return {
    documentType: 'LEY',
    id: 'ley',
    issuanceYear: 2012,
    mimeType: 'application/pdf',
    moduleIds: ['ley-y-reglamento'],
    moduleNames: ['Ley y reglamento'],
    originalFileName: 'ley.pdf',
    pageCount: 10,
    resolutionNumber: null,
    sectionTitles: [],
    title: 'Ley de Reforma Magisterial',
    versionId: 'vl',
    ...overrides,
  };
}

const remuneraciones = {
  id: 'rem',
  name: 'Remuneraciones',
  parentModuleId: null,
};
const escala = {
  id: 'esc',
  name: 'Escala remunerativa',
  parentModuleId: 'rem',
};
const asignaciones = {
  id: 'asi',
  name: 'Asignaciones y bonificaciones',
  parentModuleId: 'rem',
};
const padrones = document({
  documentType: 'RESOLUCION_MINISTERIAL',
  id: 'padrones',
  issuanceYear: 2026,
  moduleIds: ['asi', 'rem'],
  moduleNames: ['Remuneraciones'],
  title: 'Aprueban Padrones de Instituciones Educativas.',
  versionId: 'vp',
});

function withSummaries(
  documents: AvailableDocument[],
  summarize: jest.Mock = jest
    .fn()
    .mockResolvedValue('Aprueba los padrones para las asignaciones.'),
) {
  const catalogGateway = {
    getOpeningText: jest.fn().mockResolvedValue('Artículo 1. Aprobar…'),
    listAvailableDocuments: jest.fn().mockResolvedValue(documents),
  };
  return {
    catalog: new ChatCatalogService(
      catalogGateway,
      { suggest: jest.fn() },
      { summarize },
    ),
    catalogGateway,
    summarize,
  };
}

describe('ChatCatalogService — panorama de un tema', () => {
  it('ordena los panoramas y sus resúmenes desde el documento más reciente', async () => {
    const { catalog } = withSummaries([
      document({ id: 'old', issuanceYear: 2017, moduleIds: ['rem'] }),
      document({ id: 'new', issuanceYear: 2025, moduleIds: ['rem'] }),
      document({ id: 'middle', issuanceYear: 2023, moduleIds: ['rem'] }),
    ]);

    const overview = await catalog.moduleOverview({
      module: remuneraciones,
      parent: null,
    });

    expect(overview.documents.map((item) => item.id)).toEqual([
      'new',
      'middle',
      'old',
    ]);
    expect(overviewMessage(overview).indexOf('(Ley, 2025)')).toBeLessThan(
      overviewMessage(overview).indexOf('(Ley, 2023)'),
    );
  });

  it('deja al final al documento sin año y mantiene el orden al caer al tema principal', async () => {
    const { catalog } = withSummaries([
      document({ id: 'sin-anio', issuanceYear: null, moduleIds: ['rem'] }),
      document({ id: 'old', issuanceYear: 2017, moduleIds: ['rem'] }),
      document({ id: 'new', issuanceYear: 2025, moduleIds: ['rem'] }),
    ]);

    const overview = await catalog.moduleOverview({
      module: escala,
      parent: remuneraciones,
    });

    expect(overview.scope).toBe('parent');
    expect(overview.documents.map((item) => item.id)).toEqual([
      'new',
      'old',
      'sin-anio',
    ]);
  });

  it('reutiliza internamente el resumen preparado sin convertirlo en evidencia', async () => {
    const { catalog } = withSummaries([padrones]);
    await catalog.prepareModuleContext({
      module: asignaciones,
      parent: remuneraciones,
    });

    await expect(
      catalog.internalTopicContext({
        module: asignaciones,
        parent: remuneraciones,
      }),
    ).resolves.toEqual({
      documents: [
        {
          summary: 'Aprueba los padrones para las asignaciones.',
          title: 'Aprueban Padrones de Instituciones Educativas.',
        },
      ],
      moduleId: 'asi',
      scopeName: 'Asignaciones y bonificaciones',
    });
  });

  it('prepara todos los documentos del tema raíz y sus subtemas sin ampliar el contexto no probatorio', async () => {
    const scopedDocuments = Array.from({ length: 10 }, (_, index) =>
      document({
        id: `subtema-${index}`,
        issuanceYear: 2026 - index,
        moduleIds: ['rem', index % 2 === 0 ? asignaciones.id : escala.id],
        title: `Documento del subtema ${index}`,
        versionId: `version-subtema-${index}`,
      }),
    );
    const { catalog, catalogGateway, summarize } =
      withSummaries(scopedDocuments);

    await catalog.prepareModuleContext({
      module: remuneraciones,
      parent: null,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(summarize).toHaveBeenCalledTimes(10);
    expect(catalogGateway.getOpeningText).toHaveBeenCalledTimes(10);
    const summarizedTitles = (
      summarize.mock.calls as Array<[{ title: string }]>
    ).map(([input]) => input.title);
    expect(summarizedTitles).toEqual(scopedDocuments.map((item) => item.title));

    const context = await catalog.internalTopicContext({
      module: remuneraciones,
      parent: null,
      submodules: [asignaciones, escala],
    });
    // El prompt conserva un contexto breve; los diez resúmenes quedan listos
    // en segundo plano y no se transforman en fuentes citables.
    expect(context?.documents).toHaveLength(8);
    expect(context?.documents.every((item) => item.summary !== null)).toBe(
      true,
    );
    expect(context?.topicSummaries?.map((item) => item.topicName)).toEqual([
      'Remuneraciones',
      'Asignaciones y bonificaciones',
      'Escala remunerativa',
    ]);
    expect(
      context?.topicSummaries?.every((item) => item.summary !== null),
    ).toBe(true);
  });

  it('limita el precalentamiento adicional para no competir con una respuesta del docente', async () => {
    const scopedDocuments = Array.from({ length: 12 }, (_, index) =>
      document({
        id: `cola-${index}`,
        issuanceYear: 2026 - index,
        moduleIds: ['rem', asignaciones.id],
        title: `Documento en cola ${index}`,
        versionId: `version-cola-${index}`,
      }),
    );
    const delayedTitles = new Set(
      scopedDocuments.slice(8).map((item) => item.title),
    );
    let active = 0;
    let maxActive = 0;
    const release: Array<() => void> = [];
    const summarize = jest.fn(({ title }: { title: string }) => {
      if (!delayedTitles.has(title)) return Promise.resolve(`Resumen ${title}`);
      active += 1;
      maxActive = Math.max(maxActive, active);
      return new Promise<string>((resolve) => {
        release.push(() => {
          active -= 1;
          resolve(`Resumen ${title}`);
        });
      });
    });
    const { catalog } = withSummaries(scopedDocuments, summarize);

    await catalog.prepareModuleContext({
      module: remuneraciones,
      parent: null,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(summarize).toHaveBeenCalledTimes(10);
    expect(maxActive).toBe(2);

    while (release.length) {
      const batch = release.splice(0, 2);
      for (const done of batch) done();
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    expect(summarize).toHaveBeenCalledTimes(12);
    expect(maxActive).toBe(2);
  });

  it('lista los documentos del tema con un resumen generado del texto', async () => {
    const { catalog, catalogGateway, summarize } = withSummaries([
      padrones,
      document(),
    ]);

    const overview = await catalog.moduleOverview({
      module: asignaciones,
      parent: remuneraciones,
    });

    expect(overview).toEqual({
      documents: [
        {
          documentType: 'RESOLUCION_MINISTERIAL',
          id: 'padrones',
          issuanceYear: 2026,
          resolutionNumber: null,
          summary: 'Aprueba los padrones para las asignaciones.',
          title: 'Aprueban Padrones de Instituciones Educativas.',
        },
      ],
      moduleId: 'asi',
      moduleName: 'Asignaciones y bonificaciones',
      scope: 'module',
      scopeName: 'Asignaciones y bonificaciones',
      total: 1,
    });
    expect(catalogGateway.getOpeningText).toHaveBeenCalledWith('vp');
    expect(summarize).toHaveBeenCalledWith({
      excerpt: 'Artículo 1. Aprobar…',
      title: 'Aprueban Padrones de Instituciones Educativas.',
    });

    // El resumen y la lista se reutilizan: una sola lectura y una sola IA.
    await catalog.moduleOverview({ module: remuneraciones, parent: null });
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(catalogGateway.listAvailableDocuments).toHaveBeenCalledTimes(1);
  });

  it('si el subtema no tiene documentos muestra los del tema principal', async () => {
    const { catalog } = withSummaries([padrones]);

    const overview = await catalog.moduleOverview({
      module: escala,
      parent: remuneraciones,
    });

    expect(overview.scope).toBe('parent');
    expect(overview.scopeName).toBe('Remuneraciones');
    expect(overviewMessage(overview)).toBe(
      'Estos son los documentos disponibles sobre **Remuneraciones**:\n\n- **Aprueban Padrones de Instituciones Educativas** (Resolución Ministerial, 2026): Aprueba los padrones para las asignaciones.\n\nLos resúmenes son orientativos: los genera la IA a partir del texto de cada documento. Cuéntame qué necesitas saber de este documento y te respondo con la cita exacta.',
    );
  });

  it('sin documentos en el tema ni en su principal lo indica como vacío', async () => {
    const { catalog } = withSummaries([document()]);

    await expect(
      catalog.moduleOverview({ module: escala, parent: remuneraciones }),
    ).resolves.toMatchObject({ documents: [], scope: 'empty' });
    await expect(
      catalog.moduleOverview({ module: escala, parent: null }),
    ).resolves.toMatchObject({
      scope: 'empty',
      scopeName: 'Escala remunerativa',
    });
  });

  it('si la IA falla, lista igual sin resumen y reintenta en unos minutos', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(9_000_000);
    try {
      const summarize = jest
        .fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('Resumen.');
      const { catalog } = withSummaries([padrones], summarize);

      const first = await catalog.moduleOverview({
        module: remuneraciones,
        parent: null,
      });
      expect(first.documents[0]?.summary).toBeNull();
      expect(overviewMessage(first)).toContain(
        'Cuéntame qué necesitas saber de este documento',
      );
      expect(overviewMessage(first)).not.toContain('orientativos');

      now.mockReturnValue(
        9_000_000 + Math.max(FAILED_SUMMARY_CACHE_MS, DOCUMENTS_CACHE_MS) + 1,
      );
      const second = await catalog.moduleOverview({
        module: remuneraciones,
        parent: null,
      });
      expect(second.documents[0]?.summary).toBe('Resumen.');
    } finally {
      now.mockRestore();
    }
  });

  it('una salida vacía de la IA no se repite en cada consulta', async () => {
    const summarize = jest.fn().mockResolvedValue(null);
    const { catalog } = withSummaries([padrones], summarize);

    await catalog.moduleOverview({ module: remuneraciones, parent: null });
    await catalog.moduleOverview({ module: remuneraciones, parent: null });

    expect(summarize).toHaveBeenCalledTimes(1);
  });

  it('sin generador de resúmenes lista los documentos sin resumen', async () => {
    const catalog = new ChatCatalogService(
      {
        getOpeningText: jest.fn(),
        listAvailableDocuments: jest.fn().mockResolvedValue([padrones]),
      },
      { suggest: jest.fn() },
    );

    const overview = await catalog.moduleOverview({
      module: remuneraciones,
      parent: null,
    });

    expect(overview.documents[0]?.summary).toBeNull();
  });

  it('con varios documentos lo dice en plural', () => {
    expect(
      overviewMessage({
        documents: [
          { ...padrones, summary: null },
          { ...document(), summary: null },
        ],
        moduleId: 'rem',
        moduleName: 'Remuneraciones',
        scope: 'module',
        scopeName: 'Remuneraciones',
        total: 2,
      }),
    ).toContain('Sobre **Remuneraciones** tengo estos 2 documentos:');
  });

  it('si la lectura de documentos falla, la siguiente consulta lo reintenta', async () => {
    const { catalog, catalogGateway } = withSummaries([padrones]);
    catalogGateway.listAvailableDocuments.mockRejectedValueOnce(
      new Error('db down'),
    );

    await expect(catalog.availableDocuments()).rejects.toThrow('db down');
    await expect(catalog.availableDocuments()).resolves.toEqual([padrones]);
  });
});

describe('parseDocumentSummary', () => {
  it('limpia comillas y espacios; descarta lo vacío', () => {
    expect(
      parseDocumentSummary('  «Aprueba   los padrones del sector.»  '),
    ).toBe('Aprueba los padrones del sector.');
    expect(parseDocumentSummary('Corto')).toBeNull();
  });

  it('recorta un resumen demasiado largo en la última oración completa', () => {
    const summary =
      parseDocumentSummary(
        'Primera oración con contenido suficiente. '.repeat(12),
      ) ?? '';
    expect(summary.length).toBeLessThanOrEqual(420);
    expect(summary.endsWith('.')).toBe(true);
    const noStop = parseDocumentSummary('palabra '.repeat(80)) ?? '';
    expect(noStop.endsWith('…')).toBe(true);
  });
});

describe('resúmenes: cifras y espera', () => {
  it('descarta cifras que no están en el texto del documento', () => {
    expect(
      summaryStaysInSource('Fija un plazo de 30 días.', 'plazo de 30 días'),
    ).toBe(true);
    expect(
      summaryStaysInSource('Fija un plazo de 45 días.', 'plazo de 30 días'),
    ).toBe(false);
    expect(summaryStaysInSource('Sin cifras.', 'texto')).toBe(true);
  });

  it('si la IA tarda, muestra la lista sin resumen y lo guarda para después', async () => {
    jest.useFakeTimers();
    try {
      let finish: (value: string) => void = () => undefined;
      const summarize = jest.fn().mockReturnValue(
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
      );
      const { catalog } = withSummaries([padrones], summarize);

      const pending = catalog.moduleOverview({
        module: remuneraciones,
        parent: null,
      });
      await jest.advanceTimersByTimeAsync(SUMMARY_WAIT_MS + 1);
      await expect(pending).resolves.toMatchObject({
        documents: [{ summary: null }],
      });

      finish('Resumen tardío del documento.');
      await jest.advanceTimersByTimeAsync(0);
      const again = await catalog.moduleOverview({
        module: remuneraciones,
        parent: null,
      });
      expect(again.documents[0]?.summary).toBe('Resumen tardío del documento.');
      expect(summarize).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('con más documentos que los listados lo dice', () => {
    expect(
      overviewMessage({
        documents: [{ ...padrones, summary: null }],
        moduleId: 'rem',
        moduleName: 'Remuneraciones',
        scope: 'module',
        scopeName: 'Remuneraciones',
        total: 10,
      }),
    ).toContain('tengo estos 10 documentos:');
  });

  it('limpia de la caché los resúmenes vencidos', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    try {
      const summarize = jest.fn().mockResolvedValue('Resumen del documento.');
      const other = document({
        id: 'otro',
        moduleIds: ['rem'],
        versionId: 'vo',
      });
      const { catalog } = withSummaries([padrones, other], summarize);

      await catalog.moduleOverview({ module: remuneraciones, parent: null });
      now.mockReturnValue(1_000 + SUMMARY_CACHE_MS + DOCUMENTS_CACHE_MS);
      await catalog.moduleOverview({ module: remuneraciones, parent: null });

      expect(summarize).toHaveBeenCalledTimes(4);
    } finally {
      now.mockRestore();
    }
  });
});
