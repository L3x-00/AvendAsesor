import type { RetrievedChunk } from '../../rag/retrieval.gateway';
import {
  sourceLocationMessage,
  sourceLocationRequestIn,
} from './source-location';

function chunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    articleReference: null,
    chunkContent: 'Contenido.',
    chunkId: 'chunk-1',
    documentId: 'document-1',
    documentSituation: 'current',
    documentTitle: 'Norma interna',
    documentType: 'DECRETO_SUPREMO',
    documentVersionId: 'version-1',
    issuanceYear: 2025,
    lexicalScore: 0.3,
    mimeType: 'application/pdf',
    moduleIds: ['module-a'],
    moduleNames: ['Módulo A'],
    numeralReference: null,
    pageEnd: 3,
    pageStart: 3,
    pdfPageCount: 42,
    resolutionNumber: 'N.° 049-2025-EF',
    sectionTitle: null,
    semanticScore: 0.7,
    versionNumber: 1,
    ...overrides,
  };
}

describe('sourceLocationRequestIn', () => {
  // OBS-007 / QA-UI-05: «Dame el enlace del documento exacto…» se respondía con
  // «no puedo proporcionar enlaces» aunque la cita era enlazable.
  it('reconoce el pedido del enlace del documento exacto (O04 real)', () => {
    expect(
      sourceLocationRequestIn(
        'Dame el enlace del documento exacto donde aparece el sueldo de un profesor de 30 horas en 2025.',
      ),
    ).toEqual({ asksMinute: false });
  });

  it('reconoce la ubicación pedida por documento y página (C19 real)', () => {
    expect(
      sourceLocationRequestIn(
        '¿En qué documento y página se menciona el incremento de remuneraciones de 2025?',
      ),
    ).toEqual({ asksMinute: false });
  });

  it('reconoce el pedido de abrir el documento completo', () => {
    expect(
      sourceLocationRequestIn('¿Puedo ver el documento completo?'),
    ).toEqual({ asksMinute: false });
  });

  it('reconoce la descarga del archivo citado', () => {
    expect(
      sourceLocationRequestIn('Quiero descargar el PDF de esa resolución.'),
    ).toEqual({ asksMinute: false });
  });

  // OBS-012 / C20: la unidad pedida no existe en un PDF y debe aclararse.
  it('reconoce la marca de minuto pedida sobre un documento (C20 real)', () => {
    expect(
      sourceLocationRequestIn(
        '¿En qué minuto del documento se menciona el incremento de remuneraciones?',
      ),
    ).toEqual({ asksMinute: true });
  });

  // Seguimiento real reportado: «Dame el enlace.» tras una respuesta con fuentes.
  it('acepta el enlace sin nombrar el documento dentro de una conversación', () => {
    expect(
      sourceLocationRequestIn('Dame el enlace.', { inConversation: true }),
    ).toEqual({ asksMinute: false });
  });

  it('no interpreta «dame el enlace» fuera de una conversación: no hay referente', () => {
    expect(sourceLocationRequestIn('Dame el enlace.')).toBeNull();
  });

  // Preguntas de contenido: las resuelve el RAG con citas, no una lista de
  // archivos. Una lista de páginas no responde «qué dice» ni «cuánto gana».
  it.each([
    '¿Qué dice la página 3 del DS N.° 049-2025-EF?',
    '¿Cuántas páginas tiene el documento de contratación docente?',
    '¿Cuál es el monto de la remuneración de un profesor de 30 horas?',
    '¿Cómo se solicita la reasignación docente?',
    'Explícame el procedimiento de encargatura y dónde presento la solicitud.',
    '¿De qué trata el documento de contratación docente 2026?',
  ])('no intercepta la pregunta de contenido: %s', (question) => {
    expect(sourceLocationRequestIn(question)).toBeNull();
  });

  it.each([
    '¿Cuántos minutos dura la jornada de un docente nombrado?',
    '¿Cuántos minutos de clase semanales corresponden a un auxiliar?',
    '¿Cuál es el horario y la duración en minutos del recreo?',
  ])('no confunde jornada con marca de minuto: %s', (question) => {
    expect(sourceLocationRequestIn(question)).toBeNull();
  });

  it('no intercepta el pedido del portal de una entidad', () => {
    expect(
      sourceLocationRequestIn('¿Puedo saber la página del MINEDU?'),
    ).toBeNull();
    expect(
      sourceLocationRequestIn('¿Dónde está la página de la UGEL?'),
    ).toBeNull();
  });

  it('no intercepta el catálogo de documentos disponibles', () => {
    expect(
      sourceLocationRequestIn('¿Qué documentos tienes disponibles?'),
    ).toBeNull();
  });

  it('no interpreta una página del portal como página de un documento', () => {
    expect(
      sourceLocationRequestIn(
        '¿En qué página del portal del MINEDU está el cronograma?',
      ),
    ).toBeNull();
    expect(
      sourceLocationRequestIn('¿Me das el enlace del MINEDU y de la UGEL?'),
    ).toBeNull();
  });
});

describe('sourceLocationMessage', () => {
  it('responde con documento, página física y referencia enlazable', () => {
    const message = sourceLocationMessage({
      asksMinute: false,
      sources: [
        chunk({ documentTitle: 'Decreto Supremo que fija remuneraciones' }),
      ],
    });

    expect(message).toContain('Decreto Supremo (DS) · N.° 049-2025-EF · 2025');
    expect(message).toContain('la página 3 de 42');
    expect(message).toContain('[1]');
    expect(message).toContain('«Ver»');
    expect(message).toContain('se abrirá en la página 3');
    expect(message).not.toContain('no puedo');
    expect(message).not.toContain('no tengo acceso');
  });

  it('indica el rango cuando la referencia cubre varias páginas', () => {
    const message = sourceLocationMessage({
      asksMinute: false,
      sources: [chunk({ pageEnd: 5, pageStart: 4 })],
    });

    expect(message).toContain('las páginas 4–5 de 42');
    expect(message).toContain('se abrirá en la página 4');
  });

  it('no inventa paginación en un archivo sin páginas PDF', () => {
    const message = sourceLocationMessage({
      asksMinute: false,
      sources: [
        chunk({
          mimeType: 'text/plain',
          pageEnd: 1,
          pageStart: 1,
          pdfPageCount: undefined,
        }),
      ],
    });

    expect(message).toContain('sin paginación PDF');
    expect(message).not.toContain('se abrirá en la página');
  });

  it('aclara que un PDF se ubica por página y no por minuto', () => {
    const message = sourceLocationMessage({
      asksMinute: true,
      sources: [chunk()],
    });

    expect(message).toContain('por página, no por minuto');
    expect(message).not.toMatch(/\bminuto\s*\d/iu);
    expect(message).not.toMatch(/\d{1,2}:\d{2}/u);
    expect(message).toContain('la página 3 de 42');
  });

  it('rotula el antecedente histórico en vez de presentarlo como actual', () => {
    const message = sourceLocationMessage({
      asksMinute: false,
      sources: [
        chunk({
          documentSituation: 'replaced',
          documentTitle: 'Norma anterior',
          documentVersionId: 'version-0',
        }),
      ],
    });

    expect(message).toContain('reemplazado, solo referencia histórica');
  });

  it('incluye el artículo y el numeral cuando la referencia los tiene', () => {
    const message = sourceLocationMessage({
      asksMinute: false,
      sources: [
        chunk({
          articleReference: 'Artículo 5',
          numeralReference: 'numeral 5.2',
        }),
      ],
    });

    expect(message).toContain('Artículo 5, numeral 5.2');
  });

  it('enumera varias referencias con su propia cita y su propia página', () => {
    const message = sourceLocationMessage({
      asksMinute: false,
      sources: [
        chunk({ documentTitle: 'Primera norma' }),
        chunk({
          chunkId: 'chunk-2',
          documentTitle: 'Segunda norma',
          documentVersionId: 'version-2',
          pageEnd: 12,
          pageStart: 10,
        }),
      ],
    });

    expect(message).toContain('[1] «Primera norma»');
    expect(message).toContain('[2] «Segunda norma»');
    expect(message).toContain('la página 3 de 42');
    expect(message).toContain('las páginas 10–12 de 42');
    expect(message).toContain('Ábrelas con el enlace «Ver»');
  });

  it('acota la lista y declara cuántos documentos quedaron fuera', () => {
    const message = sourceLocationMessage({
      asksMinute: false,
      sources: [1, 2, 3, 4, 5, 6].map((index) =>
        chunk({
          chunkId: `chunk-${index}`,
          documentTitle: `Norma ${index}`,
          documentVersionId: `version-${index}`,
        }),
      ),
    });

    expect(message).toContain('[4]');
    expect(message).not.toContain('[5]');
    expect(message).toContain('2 documentos más');
  });

  it('sin fuentes no inventa una respuesta', () => {
    expect(sourceLocationMessage({ asksMinute: false, sources: [] })).toBe('');
  });

  // Los metadatos no son texto del modelo: una marca de política colada en un
  // título no puede aparecer como si el sistema la hubiera emitido.
  it('no propaga marcas de política de los metadatos', () => {
    const message = sourceLocationMessage({
      asksMinute: false,
      sources: [
        chunk({
          documentTitle: 'Norma [[SIN_SUSTENTO]] de remuneraciones',
          resolutionNumber: '[[FUERA_DE_AMBITO]] N.° 049-2025-EF',
        }),
      ],
    });

    expect(message).not.toContain('[[SIN_SUSTENTO]]');
    expect(message).not.toContain('[[FUERA_DE_AMBITO]]');
    expect(message).toContain('Norma de remuneraciones');
    expect(message).toContain('N.° 049-2025-EF');
  });
});
