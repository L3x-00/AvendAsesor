import {
  ChatCatalogService,
  overviewMessage,
} from './catalog/chat-catalog.service';
import type { AvailableDocument } from './catalog/chat-catalog.types';
import {
  incompleteExactReferencesMessage,
  missingExactReferencesMessage,
  noEvidenceMessage,
} from './chat.service';
import {
  buildConversationalReply,
  type ConversationalReplyKind,
} from './intent/conversational-replies';
import {
  OFFICIAL_SITES,
  buildOfficialSitesReply,
} from './intent/official-sites';
import {
  RAG_AMBIGUITY_MESSAGE,
  RAG_NO_EVIDENCE_MESSAGE,
  RAG_TOPIC_CLARIFICATION_MESSAGE,
} from '../rag/rag.constants';
import {
  buildAdvisorySystemPrompt,
  buildEvidenceSystemPrompt,
} from '../rag/prompt.builder';

/**
 * OBS-016 / CR-10: ninguna ruta de respuesta añade un cierre fijo que no
 * responda a la pregunta. La derivación a MINEDU/UGEL/DRE y el cierre
 * «Sugerencias:» eran plantillas que se pegaban a respuestas donde no venían al
 * caso. Estos nombres solo pueden aparecer cuando la persona los pidió (ruta
 * de enlaces oficiales) o cuando son el contenido de la respuesta.
 */
const FIXED_CLOSING =
  /\bSugerencias:|\b(?:MINEDU|UGEL|DRE|GRE)\b|verificarlo con|consulta(?:r)? (?:con )?(?:tu|la) (?:UGEL|DRE)/iu;

function expectNoFixedClosing(text: string): void {
  expect(text).not.toMatch(FIXED_CLOSING);
}

const CONVERSATIONAL_KINDS: ConversationalReplyKind[] = [
  'greeting',
  'thanks',
  'acknowledgment',
  'farewell',
  'ask_announcement',
  'capabilities',
  'catalog',
  'document_catalog',
  'out_of_domain',
  'system_limit',
  'credentials_help',
  'unrelated_no_evidence',
];

function catalogDocument(
  overrides: Partial<AvailableDocument> = {},
): AvailableDocument {
  return {
    documentType: 'LEY',
    id: 'ley',
    issuanceYear: 2012,
    mimeType: 'application/pdf',
    moduleIds: ['ley'],
    moduleNames: ['Ley y reglamento'],
    originalFileName: 'ley.pdf',
    pageCount: 10,
    resolutionNumber: null,
    sectionTitles: [],
    title: 'Ley de Reforma Magisterial',
    versionId: 'v1',
    ...overrides,
  };
}

function catalogWith(documents: AvailableDocument[]): ChatCatalogService {
  return new ChatCatalogService(
    {
      getOpeningText: jest.fn().mockResolvedValue('Texto.'),
      listAvailableDocuments: jest.fn().mockResolvedValue(documents),
    },
    { suggest: jest.fn().mockResolvedValue([]) },
  );
}

describe('cierres fijos (OBS-016)', () => {
  it.each(CONVERSATIONAL_KINDS)(
    'la respuesta amable «%s» no deriva a MINEDU, UGEL ni DRE',
    (kind) => {
      expectNoFixedClosing(
        buildConversationalReply(kind, {
          role: 'docente',
          topics: ['Remuneraciones', 'Licencias'],
        }),
      );
    },
  );

  it('los mensajes de sin evidencia, aclaración y negativa son contextuales', () => {
    for (const text of [
      RAG_NO_EVIDENCE_MESSAGE,
      RAG_TOPIC_CLARIFICATION_MESSAGE,
      RAG_AMBIGUITY_MESSAGE,
      noEvidenceMessage('current'),
      noEvidenceMessage('historical'),
      missingExactReferencesMessage([{ display: 'RM 123-2024-MINEDU' }]),
      incompleteExactReferencesMessage([{ display: 'la Directiva 12' }]),
    ]) {
      // Una norma puede llevar «MINEDU» en su nombre: es su identidad, no un
      // cierre. Se retira antes de buscar la derivación genérica.
      expectNoFixedClosing(text.replace(/\bRM [\w-]*MINEDU\b/gu, ''));
    }
  });

  it('el catálogo sin documentos no manda a verificar con UGEL, DRE o MINEDU', async () => {
    const withoutDocuments = await catalogWith([]).reply();
    const withoutMatch = await catalogWith([catalogDocument()]).reply(
      undefined,
      { question: 'dame los anexos' },
    );

    expect(withoutDocuments.documents).toEqual([]);
    expect(withoutMatch.documents).toEqual([]);
    expectNoFixedClosing(withoutDocuments.message);
    expectNoFixedClosing(withoutMatch.message);
  });

  it('la lista de documentos y el panorama de un tema no añaden cierres fijos', async () => {
    const catalog = catalogWith([catalogDocument()]);

    expectNoFixedClosing((await catalog.reply()).message);
    expectNoFixedClosing(
      overviewMessage(
        await catalog.moduleOverview({
          module: { id: 'ley', name: 'Ley y reglamento', parentModuleId: null },
          parent: null,
        }),
      ),
    );
  });

  it('el pedido de enlaces responde con los enlaces y nada más', () => {
    const reply = buildOfficialSitesReply(OFFICIAL_SITES.slice(0, 2));
    const lines = reply.split('\n').filter((line) => line.trim());

    // Introducción y un elemento por portal: ningún cierre genérico después.
    expect(lines).toHaveLength(1 + 2);
    expect(lines.slice(1).every((line) => line.startsWith('- ['))).toBe(true);
  });

  it('el prompt de evidencia mantiene «Sugerencias:» opcional y sin portales por defecto', () => {
    const prompt = buildEvidenceSystemPrompt();

    expect(prompt).toContain('Cierra con «Sugerencias:» solo si aporta');
    expect(prompt).not.toMatch(
      /(?:siempre|obligatoriamente) .{0,40}Sugerencias/iu,
    );
    expect(prompt).toContain('no añadas por defecto portales');
  });

  it('el prompt del modo asesor no impone entidades ni cierres por defecto', () => {
    const prompt = buildAdvisorySystemPrompt();

    expect(prompt).toContain('no menciones ni enlaces entidades por defecto');
    expect(prompt).not.toMatch(
      /Cierra con|siempre (?:cierra|termina|recomienda)/iu,
    );
  });
});
