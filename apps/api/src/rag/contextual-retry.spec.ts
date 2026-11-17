import {
  buildContextualRetryQuery,
  contextualRetryMetrics,
  retryIndicatesTopicSwitch,
} from './contextual-retry';
import { RAG_QUERY_TEXT_MAX_CHARS } from './rag.constants';
import { detectTopicIntent } from './topic-intent';

const chunk = (semanticScore: number, content: string) => ({
  articleReference: null,
  chunkContent: content,
  chunkId: `chunk-${semanticScore}`,
  documentId: 'doc',
  documentSituation: 'current' as const,
  documentTitle: 'Resolución de reasignación docente',
  documentType: 'RESOLUCION_VICEMINISTERIAL',
  documentVersionId: 'version',
  issuanceYear: 2025,
  lexicalScore: 0.5,
  mimeType: 'application/pdf',
  moduleIds: ['module'],
  moduleNames: ['Contratación y desplazamientos'],
  numeralReference: null,
  pageEnd: 2,
  pageStart: 1,
  sectionTitle: 'De la reasignación',
  semanticScore,
  versionNumber: 1,
});

describe('reintento contextual determinista', () => {
  beforeEach(() => contextualRetryMetrics.reset());

  it('compone tema + pregunta sin invocar al modelo', () => {
    expect(
      buildContextualRetryQuery(
        'hablame mas sobre las situaciones',
        'reasignación docente requisitos etapas',
      ),
    ).toBe(
      'reasignación docente requisitos etapas hablame mas sobre las situaciones',
    );
  });

  it('no duplica el tema cuando la pregunta ya lo nombra', () => {
    expect(
      buildContextualRetryQuery(
        'reasignación docente y los requisitos',
        'reasignación docente y los requisitos',
      ),
    ).toBe('reasignación docente y los requisitos');
  });

  it('acepta valores vacíos sin componer una consulta inválida', () => {
    expect(buildContextualRetryQuery('pregunta', '')).toBe('pregunta');
    expect(buildContextualRetryQuery('', 'tema')).toBe('tema');
  });

  it('acota la longitud del texto del segundo intento', () => {
    expect(
      buildContextualRetryQuery('casos '.repeat(200), 'reasignación docente')
        .length,
    ).toBeLessThanOrEqual(RAG_QUERY_TEXT_MAX_CHARS);
    expect(
      buildContextualRetryQuery('casos '.repeat(1400), 'reasignación docente'),
    ).toHaveLength(RAG_QUERY_TEXT_MAX_CHARS);
  });

  it('no fuerza la herencia si el segundo intento trae otro tema con ventaja', () => {
    const intent = detectTopicIntent('quiero reasignarme')!;
    const own = [
      chunk(0.6, 'La reasignación docente se solicita por unidad familiar.'),
    ];
    const other = [
      chunk(
        0.8,
        'La licencia por incapacidad temporal requiere certificado médico.',
      ),
    ];
    expect(
      retryIndicatesTopicSwitch({
        inheritedIntent: intent,
        margin: 0.08,
        question: 'hablame mas sobre las situaciones',
        sources: [...own, ...other],
      }),
    ).toBe(true);
  });

  it('acepta el reintento cuando el tema heredado domina', () => {
    const intent = detectTopicIntent('quiero reasignarme')!;
    const own = [
      chunk(0.8, 'La reasignación docente se solicita por unidad familiar.'),
    ];
    const other = [
      chunk(
        0.6,
        'La licencia por incapacidad temporal requiere certificado médico.',
      ),
    ];
    expect(
      retryIndicatesTopicSwitch({
        inheritedIntent: intent,
        margin: 0.08,
        question: 'hablame mas sobre las situaciones',
        sources: [...own, ...other],
      }),
    ).toBe(false);
  });

  it('acepta un fragmento del proceso que no repite su nombre', () => {
    const intent = detectTopicIntent('quiero reasignarme')!;
    const withoutProcessName = {
      ...chunk(0.8, ''),
      chunkContent: 'El plazo para presentar la solicitud es de quince días.',
      documentTitle: 'Norma técnica de escalafón docente',
      sectionTitle: 'Del plazo',
    };
    expect(
      retryIndicatesTopicSwitch({
        inheritedIntent: intent,
        margin: 0.08,
        question: 'hablame mas sobre las situaciones',
        sources: [withoutProcessName],
      }),
    ).toBe(false);
  });

  it('no declara cambio de tema cuando el reintento no devolvió nada', () => {
    const intent = detectTopicIntent('quiero reasignarme')!;
    expect(
      retryIndicatesTopicSwitch({
        inheritedIntent: intent,
        margin: 0.08,
        question: 'hablame mas sobre las situaciones',
        sources: [],
      }),
    ).toBe(false);
  });

  it('no declara cambio de tema sin una intención heredada', () => {
    expect(
      retryIndicatesTopicSwitch({
        inheritedIntent: null,
        margin: 0.08,
        question: 'pagina 24 de la rvm',
        sources: [chunk(0.9, 'Otra norma cualquiera.')],
      }),
    ).toBe(false);
  });

  it('registra intentos, mejoras y cambios de tema sin texto de la pregunta', () => {
    contextualRetryMetrics.recordAttempt();
    contextualRetryMetrics.recordImprovement();
    contextualRetryMetrics.recordAttempt();
    contextualRetryMetrics.recordAttempt();
    contextualRetryMetrics.recordTopicSwitch();
    expect(contextualRetryMetrics.snapshot()).toEqual({
      attempts: 3,
      improved: 1,
      skippedTopicSwitch: 1,
    });
  });
});
