import { classifyTurnIntent } from './intent-classifier';
import { buildConversationalReply } from './conversational-replies';
import {
  DRE_DIRECTORY_URL,
  OFFICIAL_SITES,
  UGEL_DIRECTORY_URL,
  buildOfficialSitesReply,
  officialSitesIn,
} from './official-sites';
import { normalizeSpanishText } from '../../rag/text-normalization';

const OFFICIAL_SITES_INTENT = { lane: 'social', subtype: 'official_sites' };

function namesIn(message: string): string[] {
  return officialSitesIn(normalizeSpanishText(message)).map(
    (site) => site.href,
  );
}

describe('pedido de la página oficial de una entidad', () => {
  it.each([
    'puedo saber la pagina del minedu',
    '¿Si puedo saber la página del MINEDU?',
    'puedo saber la pagina del minudo',
    '¿Cuál es la página web de la UGEL?',
    'Pásame el link de PerúEduca, por favor',
    'dame el enlace del Ministerio de Educación',
    'Hola, ¿me compartes el portal de la SUNEDU?',
    '¿Dónde encuentro la página oficial de la DRE?',
    'quiero entrar a la web de essalud',
    'link de la derrama magisterial',
    '¿Cuál es la página de SERVIR?',
    'páginas del minedu y de la ugel',
    '¿Me das la página del MINEDU?',
    '¿Hay una página de la UGEL?',
    'Gracias, ¿me pasas el link de la UGEL?',
    // El corrector ortográfico puede dejar «ministerial» en lugar de «ministerio».
    'dame el enlace del ministerial de educación',
  ])('«%s» recibe los enlaces verificados, sin RAG', (message) => {
    expect(classifyTurnIntent(message)).toEqual(OFFICIAL_SITES_INTENT);
    expect(classifyTurnIntent(message, { inConversation: true })).toEqual(
      OFFICIAL_SITES_INTENT,
    );
  });

  it.each([
    // «Página» de un documento o de una norma: es una consulta.
    '¿En qué página de la norma del MINEDU dice eso?',
    '¿Qué dice la página 5 del documento del MINEDU?',
    'pagina de la ugel 06',
    // Trae sustancia propia: el RAG decide con sus fuentes.
    '¿Cuál es la página de la UGEL para ver las plazas de auxiliares?',
    '¿Qué publica la página del MINEDU sobre el nombramiento?',
    // Sin entidad o sin pedido de página.
    '¿Cuál es la página?',
    '¿Qué funciones tiene la UGEL?',
    'me puede servir la página',
    // Sí o no, obligación, disyuntiva o caso: un «Claro, aquí tienes» sonaría
    // a una respuesta que nadie sustentó (revisión independiente, TSK-0073).
    '¿Hay que entrar a la página del MINEDU?',
    '¿Tiene que ingresar al portal de PerúEduca?',
    '¿Es la página del MINEDU o de la UGEL?',
    '¿Esta página es del MINEDU?',
    'Si no encuentro la página de la UGEL, ¿a dónde voy?',
    'Gracias por el link de la UGEL',
  ])('«%s» no se trata como pedido de enlace', (message) => {
    expect(classifyTurnIntent(message)).not.toEqual(OFFICIAL_SITES_INTENT);
  });

  it('reconoce cada entidad pedida, en el orden del catálogo', () => {
    expect(namesIn('páginas de la UGEL y del MINEDU')).toEqual([
      'https://www.gob.pe/minedu',
      UGEL_DIRECTORY_URL,
    ]);
    expect(namesIn('web de la Gerencia Regional de Educación')).toEqual([
      DRE_DIRECTORY_URL,
    ]);
    expect(namesIn('me puede servir')).toEqual([]);
  });

  it('solo enlaza direcciones https verificadas de dominios oficiales', () => {
    // Si cambia una dirección, cambia también en la web
    // (apps/web/src/components/chat/official-links.tsx).
    expect(UGEL_DIRECTORY_URL).toBe(
      'https://www.gob.pe/busquedas?contenido%5B%5D=instituciones&term=UGEL',
    );
    expect(DRE_DIRECTORY_URL).toBe(
      'https://www.gob.pe/busquedas?contenido%5B%5D=instituciones&term=DRE+GRE',
    );
    for (const site of OFFICIAL_SITES) {
      const url = new URL(site.href);
      expect(url.protocol).toBe('https:');
      expect(url.hostname).toMatch(
        /(?:^|\.)(?:gob\.pe|perueduca\.pe|elperuano\.pe|derrama\.org\.pe)$/u,
      );
    }
  });

  it('arma la respuesta con enlaces Markdown y sin citas', () => {
    const reply = buildOfficialSitesReply(
      officialSitesIn(normalizeSpanishText('página de la UGEL')),
    );

    expect(reply).toContain('Claro, aquí tienes el enlace oficial:');
    expect(reply).toContain(
      `- [Directorio oficial de las UGEL en gob.pe](${UGEL_DIRECTORY_URL}): cada UGEL tiene su propia página`,
    );
    expect(reply).not.toMatch(/\[\d+\]/u);
  });

  it('sin entidad reconocida, la plantilla ofrece los portales del sector', () => {
    const reply = buildConversationalReply('official_sites');

    expect(reply).toContain('Claro, aquí tienes los enlaces oficiales:');
    expect(reply).toContain('https://www.gob.pe/minedu');
    expect(reply).toContain(UGEL_DIRECTORY_URL);
    expect(reply).toContain(DRE_DIRECTORY_URL);
  });
});
