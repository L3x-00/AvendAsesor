import { documentTypePromptLabel } from '../../rag/document-type';
import type { RetrievedChunk } from '../../rag/retrieval.gateway';
import { normalizeSpanishText } from '../../rag/text-normalization';
import { OFFICIAL_RESOURCE_NOUN, officialSitesIn } from './official-sites';

/**
 * Intención determinista «enlace o ubicación del documento» (CR-08, punto 4).
 *
 * Antes, «Dame el enlace del documento exacto…» llegaba al modelo y el modelo
 * respondía que no podía proporcionar enlaces, aunque la misma respuesta mostraba
 * una cita enlazable (OBS-007 / QA-UI-05): negaba una capacidad que la interfaz
 * sí ofrece. Y una pregunta por «minuto» de un PDF no aclaraba que la unidad
 * disponible es la página (OBS-012).
 *
 * Esta ruta NO invoca al proveedor de IA: repite únicamente identidad, página
 * física y referencia enlazable de las fuentes ya recuperadas y verificadas. La
 * página sale del fragmento real, no de una estimación, y el enlace lo genera la
 * aplicación junto a cada fuente (la cita [n] del texto lleva a esa fila).
 *
 * Un pedido del portal de una entidad no entra aquí: eso lo responde el carril
 * de portales oficiales (`official-sites.ts`), no la ubicación de un documento.
 */

export interface SourceLocationRequest {
  /** Pidió una marca de minuto: unidad de audio/video, no de un PDF. */
  asksMinute: boolean;
}

export interface SourceLocationRequestOptions {
  /**
   * El turno continúa una conversación: «dame el enlace» basta para referirse a
   * las fuentes de la respuesta anterior, sin volver a nombrar el documento.
   */
  inConversation?: boolean;
}

export interface SourceLocationMessageInput {
  asksMinute: boolean;
  sources: RetrievedChunk[];
}

/** Nombres de documento: sin uno, «página 3» no identifica nada. */
const DOCUMENT_NOUN =
  /\b(?:documento|documentos|norma|normas|resolucion|resoluciones|pdf|fuente|fuentes|archivo|archivos|anexo|anexos|informe|informes|planilla|planillas|contrato|contratos|directiva|directivas|decreto|decretos|ley|leyes|reglamento|reglamentos|memorandum|oficio|oficios|acta|actas|cronograma|cronogramas)\b/u;

/** Código de norma («049-2025-EF», «326-2017»): también identifica documento. */
const NORM_CODE = /\b\d{2,5}\s*-\s*(?:19|20)\d{2}\b/u;

/** Lo que se pide: el enlace, la descarga o la ubicación del archivo. */
const LOCATION_NOUN =
  /\b(?:enlace|enlaces|link|links|url|urls|descarga|descargas)\b/u;
const PAGE_OR_PLACE =
  /\b(?:pagina|paginas|parte|partes|ubicacion|apartado|acapite|seccion)\b/u;
const PLACE_FRAME = /\b(?:en que|en cual|en cuales|donde|de que)\b/u;
const OPEN_ASK =
  /\b(?:abre|abreme|abrir|abrirme|abro|descarga|descargar|descargarme|baja|bajar|bajarme|visualiza|visualizar|ver|pasa|pasame|pasas|pasarme|muestra|muestrame|mostrar|mostrarme|envia|enviame|enviar|enviarme|manda|mandame|mandar|mandarme|comparte|comparteme|compartir|compartirme|facilita|facilitame|facilitar|facilitarme)\b/u;
/** Referencia definida al archivo («ese documento», «la norma», «el PDF»). */
const DEFINITE_DOCUMENT =
  /\b(?:el|la|los|las|ese|esa|esos|esas|este|esta|estos|estas|dicho|dicha|mismo|misma|un|una)\s+(?:documento|documentos|norma|normas|resolucion|resoluciones|pdf|fuente|fuentes|archivo|archivos|anexo|anexos|informe|informes|planilla|contrato|directiva|decreto|ley|reglamento|memorandum|oficio|acta|cronograma)\b/u;

const MINUTE_NOUN = /\bminutos?\b/u;
const MINUTE_FRAME =
  /\b(?:en que|que|a que|desde que|donde|en cual|cual)\s+minutos?\b|\bminutos?\s+(?:del|de la|de los|de las|en el|en la|donde|en que|en los|en las)\b/u;
/** Una jornada, un horario o una duración se miden en minutos de verdad. */
const DURATION_CONTEXT =
  /\b(?:jornada|horas?|carga horaria|horario|duracion|durar|duro|duran|recreo|clase|clases|sesion|sesiones)\b/u;

/**
 * Preguntas que piden contenido, no ubicación: «¿qué dice la página 3?»,
 * «¿cuánto gana un docente?». Se responden con la evidencia y el modelo; la ruta
 * de ubicación no debe adelantarse con una lista de archivos.
 */
const CONTENT_ASK =
  /\b(?:que dice|que dicen|que establece|que establecen|que indica|que indican|que senala|que senalan|que menciona|que mencionan|que contiene|que requisitos|cuanto|cuanta|cuantos|cuantas|cual es el monto|cuales son los requisitos|cuando|como se calcula|como se solicita|como se tramita|que procedimiento|por que|explicame|explica|resume|resumen|detalla|de que trata)\b/u;

/**
 * «El enlace entre A y B» es una relación conceptual, no un archivo: en una
 * conversación, la palabra «enlace» no basta para pedir un documento.
 */
const FIGURATIVE_LINK = /\benlaces?\b(?:\s+\w+){0,3}\s+entre\b/u;

/** El pedido de un catálogo lo resuelve su propio carril, no esta ruta. */
const CATALOG_NOUN = /\b(?:catalogo|catalogos|listado|inventario)\b/u;

/**
 * Materias de contenido (montos, plazos, procedimientos, trámites): si el turno
 * gira sobre una de ellas y no nombra el documento, la persona quiere el dato y
 * no una lista de archivos. Un pedido con sujeto propio no es un seguimiento.
 */
const CONTENT_SUBJECT =
  /\b(?:requisito|requisitos|monto|montos|plazo|plazos|procedimiento|procedimientos|paso|pasos|cronograma|cronogramas|calendario|fecha|fechas|remuneracion|remuneraciones|sueldo|sueldos|haberes|pago|pagos|deposito|depositan|depositar|bono|bonos|asignacion|asignaciones|gratificacion|gratificaciones|aguinaldo|porcentaje|porcentajes|presupuesto|escala|escalas|tope|topes|constancia|constancias|certificado|certificados|boleta|boletas|expediente|expedientes|tramite|tramites|nombramiento|encargatura|reasignacion|reintegro|vacaciones)\b/u;

/**
 * «La página del portal», «la sección de la plataforma»: navegación web, no la
 * página física de un PDF. Tampoco es un seguimiento de la conversación.
 */
const WEB_PLACE_NOUN =
  /\b(?:portal|portales|plataforma|plataformas|pagina web|paginas web|sitio web|sitios web|web|intranet|aplicativo|aplicativos|aula virtual|seccion|secciones|apartado|apartados|pestana|pestanas|formulario|formularios)\b/u;

function asksMinuteUnit(normalized: string, inConversation: boolean): boolean {
  if (!MINUTE_NOUN.test(normalized)) return false;
  if (!MINUTE_FRAME.test(normalized)) return false;
  if (DURATION_CONTEXT.test(normalized)) return false;
  // «…se publica el cronograma en el portal?» es una pregunta de web, no la
  // ubicación física del PDF.
  if (WEB_PLACE_NOUN.test(normalized)) return false;
  // Anclado al documento («…del documento se menciona el incremento?») sí es la
  // marca de ubicación; sin ancla, un sujeto de contenido la descarta.
  if (DOCUMENT_NOUN.test(normalized) || NORM_CODE.test(normalized)) return true;
  return inConversation && !CONTENT_SUBJECT.test(normalized);
}

/**
 * Detecta el pedido de enlace, descarga o ubicación. Es deliberadamente
 * conservador: ante la duda devuelve `null` y la consulta sigue el flujo RAG con
 * sus citas (fail-closed), porque una lista de archivos no responde una pregunta
 * de contenido ni el pedido del portal de una entidad.
 */
export function sourceLocationRequestIn(
  question: string,
  options: SourceLocationRequestOptions = {},
): SourceLocationRequest | null {
  const normalized = normalizeSpanishText(question);
  if (!normalized) return null;
  const inConversation = options.inConversation === true;

  if (asksMinuteUnit(normalized, inConversation)) return { asksMinute: true };
  if (!/\p{L}/u.test(normalized)) return null;
  if (CONTENT_ASK.test(normalized)) return null;
  if (FIGURATIVE_LINK.test(normalized)) return null;
  if (CATALOG_NOUN.test(normalized)) return null;
  // «¿en qué página del portal del MINEDU…?» pide un destino web, no la página
  // de un PDF: lo resuelve el carril de portales oficiales o el RAG con citas.
  if (
    OFFICIAL_RESOURCE_NOUN.test(normalized) &&
    officialSitesIn(normalized).length
  ) {
    return null;
  }

  const mentionsDocument =
    DOCUMENT_NOUN.test(normalized) || NORM_CODE.test(normalized);
  // Un seguimiento de la conversación no vuelve a nombrar el documento, pero
  // tampoco puede traer su propio tema: «¿dónde veo la sección de trámites?» o
  // «¿en qué página está el requisito?» piden contenido o navegación web.
  const hasOwnSubject =
    CONTENT_SUBJECT.test(normalized) || WEB_PLACE_NOUN.test(normalized);
  const refersToDocument =
    mentionsDocument || (inConversation && !hasOwnSubject);
  const asksLink = LOCATION_NOUN.test(normalized) && refersToDocument;
  const asksPlace =
    refersToDocument &&
    PLACE_FRAME.test(normalized) &&
    PAGE_OR_PLACE.test(normalized);
  const asksToOpen =
    refersToDocument &&
    OPEN_ASK.test(normalized) &&
    DEFINITE_DOCUMENT.test(normalized);

  if (asksLink || asksPlace || asksToOpen) return { asksMinute: false };
  return null;
}

/** Tope de documentos distintos que se enumeran en la respuesta. */
const MAX_LISTED_DOCUMENTS = 4;
const MAX_TITLE_CHARS = 140;

/**
 * Los metadatos vienen de la base, no del modelo: si un título o una referencia
 * trajeran por error una marca de política («[[SIN_SUSTENTO]]»), no pueden
 * aparecer dentro de una respuesta determinista como si la política la hubiera
 * emitido.
 */
const POLICY_MARKER = /\[\[?\s*(?:SIN_SUSTENTO|FUERA_DE_AMBITO)\s*\]\]?/giu;

function cleanMetadata(value: string | null | undefined): string {
  return (value ?? '').replace(POLICY_MARKER, '').replace(/\s+/gu, ' ').trim();
}

function isPdf(source: RetrievedChunk): boolean {
  return (
    source.mimeType == null ||
    source.mimeType.toLocaleLowerCase('es') === 'application/pdf'
  );
}

/** Identidad verificable: título y referencia de la norma, sin inventar nada. */
function documentIdentity(source: RetrievedChunk): string {
  const title = cleanMetadata(source.documentTitle);
  const reference = [
    cleanMetadata(documentTypePromptLabel(source.documentType)),
    cleanMetadata(source.resolutionNumber),
    source.issuanceYear ? String(source.issuanceYear) : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  if (title && reference) {
    return `«${title.slice(0, MAX_TITLE_CHARS)}» (${reference})`;
  }
  if (title) return `«${title.slice(0, MAX_TITLE_CHARS)}»`;
  if (reference) return reference;
  return 'el documento recuperado';
}

function situationNote(source: RetrievedChunk): string {
  switch (source.documentSituation) {
    case 'replaced':
      return ' (reemplazado, solo referencia histórica)';
    case 'archived':
      return ' (archivado, solo antecedente histórico)';
    case 'current':
      return '';
  }
}

function articleNote(source: RetrievedChunk): string {
  const parts = [source.articleReference, source.numeralReference]
    .map((part) => cleanMetadata(part))
    .filter((part): part is string => Boolean(part));
  return parts.length ? `, ${parts.join(', ')}` : '';
}

/**
 * Rango físico del fragmento. Un metadato incompleto no puede convertirse en la
 * página «null»: sin números, la ubicación se declara desconocida.
 */
function pageRange(
  source: RetrievedChunk,
): { from: number; to: number } | null {
  const from = typeof source.pageStart === 'number' ? source.pageStart : null;
  const to = typeof source.pageEnd === 'number' ? source.pageEnd : null;
  const start = from ?? to;
  if (start === null) return null;
  return { from: start, to: to ?? start };
}

/**
 * Ubicación con la unidad real del archivo: página física del PDF (con el total
 * cuando se conoce) o fragmento interno si la versión no tiene paginación PDF.
 */
function locationPhrase(source: RetrievedChunk): string {
  if (!isPdf(source)) return 'un fragmento interno, sin paginación PDF';

  const range = pageRange(source);
  if (!range) {
    return source.pdfPageCount
      ? `un fragmento del PDF de ${source.pdfPageCount} páginas, sin página declarada`
      : 'un fragmento del PDF, sin página declarada';
  }
  const pages =
    range.from === range.to
      ? `la página ${range.from}`
      : `las páginas ${range.from}–${range.to}`;
  return source.pdfPageCount
    ? `${pages} de ${source.pdfPageCount}`
    : `${pages} del PDF`;
}

function singleOpenInstruction(source: RetrievedChunk): string {
  if (!isPdf(source)) return 'Ábrela con el enlace «Ver» de tus referencias.';

  const range = pageRange(source);
  return range
    ? `Ábrela con el enlace «Ver» de tus referencias: se abrirá en la página ${range.from}.`
    : 'Ábrela con el enlace «Ver» de tus referencias: se abrirá al inicio del PDF.';
}

function minuteNotice(hasPdf: boolean): string {
  return hasPdf
    ? 'Los documentos que uso son PDF y se ubican por página, no por minuto: no puedo darte una marca de minuto.'
    : 'Los documentos que uso no tienen marcas de tiempo: se ubican como fragmentos internos, sin paginación PDF.';
}

/**
 * Respuesta determinista con el documento, la página física y la referencia
 * enlazable. Solo repite metadatos ya verificados de las fuentes entregadas.
 */
export function sourceLocationMessage(
  input: SourceLocationMessageInput,
): string {
  const sources = input.sources;
  if (!sources.length) return '';

  const hasPdf = sources.some(isPdf);
  const notice = input.asksMinute ? `${minuteNotice(hasPdf)} ` : '';
  const listed = sources.slice(0, MAX_LISTED_DOCUMENTS);
  const remaining = sources.length - listed.length;

  if (listed.length === 1) {
    const source = listed[0];
    return (
      `${notice}La fuente [1] corresponde a ${documentIdentity(source)}` +
      `${situationNote(source)} y su ubicación es ${locationPhrase(source)}` +
      `${articleNote(source)} [1]. ${singleOpenInstruction(source)}`
    );
  }

  const items = listed.map((source, index) => {
    const rank = index + 1;
    return (
      `[${rank}] ${documentIdentity(source)}${situationNote(source)}, ` +
      `${locationPhrase(source)}${articleNote(source)}`
    );
  });
  const tail = remaining
    ? ` En tus referencias hay ${remaining} fuente${remaining === 1 ? '' : 's'} más.`
    : '';
  // Solo se promete la página cuando todas las referencias enumeradas la tienen:
  // no todos los fragmentos declaran paginación.
  const allLocated = listed.every(
    (source) => !isPdf(source) || pageRange(source) !== null,
  );
  return (
    `${notice}Estas son las referencias disponibles para tu consulta: ` +
    `${items.join('; ')}.${tail} Ábrelas con el enlace «Ver» de cada fuente en ` +
    `tus referencias${hasPdf && allLocated ? ': se abrirán en la primera página indicada.' : '.'}`
  );
}
