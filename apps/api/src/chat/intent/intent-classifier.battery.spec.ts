import {
  announcesNewTopic,
  classifyTurnIntent,
  hasEducationalSignal,
  isTopiclessQuestion,
} from './intent-classifier';

/**
 * Batería de aceptación del clasificador (Hito 3, puntos 1, 2, 3, 10 y 11),
 * construida con las frases de la auditoría de cumplimiento de 2026-09-23.
 * Protege en ambos sentidos: ninguna consulta educativa puede quedar fuera del
 * RAG, y la charla o los pedidos ajenos no deben terminar en «No encontré
 * sustento».
 */

const EDUCATIONAL_QUERIES = [
  // Ejemplos textuales del cliente
  '¿Puedo solicitar destaque si estoy nombrado?',
  '¿Cuáles son los requisitos para una reasignación?',
  '¿Qué sucede si un auxiliar tiene una inasistencia?',
  '¿Quién reemplaza al director cuando se encuentra de licencia?',
  'Buenos días, quisiera saber cuánto tiempo tiene un director para responder esta solicitud.',
  // Desplazamientos y cargos
  'puedo pedir destaque por salud de mi mama',
  'q necesito para destacarme a otra ugel',
  'reasignasion por unidad familiar requisitos',
  'como hago una permuta con otra colega',
  'quiero encargarme de la direccion del colegio',
  // Licencias y asistencia
  'licencia sin goce cuanto tiempo maximo',
  'lisencia por maternidad cuantos dias son',
  'me dan dias por fallecimiento de mi papa?',
  'descanso medico de 20 dias quien me lo paga',
  'Hola, falté ayer',
  'receta medica para mi licencia',
  'presente mi receta medica y aun asi me descontaron el dia',
  'va a llover mucho y no hay movilidad, puedo faltar?',
  // Jornada y remuneraciones
  'cuantas horas pedagogicas debo dictar',
  'me pagan horas extras si me quedo en el cole',
  'jornada laboral del auxiliar de educacion',
  'cuanto me toca de cts',
  'me descontaron del sueldo sin avisar',
  'cuanto gana un docente de la primera escala',
  '¿cuánto gana un docente?',
  'cuanto tiempo hace que no nos pagan',
  'Buenas, jubilación',
  'a que edad me jubilo como profesor',
  '¿qué haces si no te pagan?',
  // Evaluación, ascenso, contrato
  'que pasa si desapruebo la evaluacion de desempeño',
  'examen de nombramiento 2026 cuando es',
  'que tiempo hace falta para ascender',
  'tengo una serie de dudas sobre mi contrato',
  // Directivos y auxiliares
  'funciones del auxiliar de educacion',
  'el auxiliar puede hacer clases?',
  'que hago si el director no me firma mi papeleta',
  'el director me grita delante de los alumnos',
  'cuanto dura la designacion de un director',
  'mi director me pide que le cocine para la actividad',
  // Disciplinario
  'me abrieron un proceso administrativo',
  '¿Cómo preparar mi descargo si me abrieron proceso?',
  'un padre de familia me denuncio que hago',
  // Contexto escolar con palabras que antes disparaban «fuera de ámbito»
  'el clima institucional de mi colegio es pesimo que puedo hacer',
  'el clima laboral en mi colegio es malo',
  'la temperatura del aula es muy alta, puedo suspender clases',
  'el partido de futbol del colegio puedo salir en horario de clases',
  'me pueden descontar por ir al partido de futbol de mi hijo',
  '¿puedo dictar clases con tenis?',
  'dame un chiste para empezar mi clase',
  'pelicula para trabajar valores con mis alumnos',
  'como cocinar con los niños en el aula',
  'como preparar una sesion de aprendizaje',
  '¿Puedo poner una canción en la actuación del Día de la Madre?',
  // Pedagógicos y del sector (fail-closed: al RAG)
  '¿cómo hago una sesión de aprendizaje?',
  '¿qué es el CNEB?',
  '¿cómo trato a un alumno con TDAH?',
  '¿qué dice la ley sobre el bullying?',
  'que es la ley 29944',
  'que es el PAD',
  'como calculo mi pension en la onp',
  // Seguimientos cortos
  'y el plazo?',
  '¿Y cuál es el plazo?',
  'y cuanto demora?',
  'y si soy contratado?',
  'y para auxiliares?',
  'y eso donde lo presento?',
  'cuantos dias?',
  'y si me lo niegan?',
  'ok y el monto',
  'gracias, y cuanto demora',
  'ya, y los requisitos',
  'entiendo, y el tramite?',
  '¿y qué haces si no te responden?',
  '¿y eso cómo me puedes ayudar?',
  'otra consulta: ¿cuántos días de vacaciones tengo?',
];

const SOCIAL: Array<[string, string]> = [
  ['Hola', 'greeting'],
  ['hola que tal', 'greeting'],
  ['hola, buenos dias', 'greeting'],
  ['Buenas tardes, ¿cómo está?', 'greeting'],
  ['buenas noches, que tal, como estas?', 'greeting'],
  ['¿Cómo estás?', 'greeting'],
  ['¿todo bien?', 'greeting'],
  ['hola ¿estás ahí?', 'greeting'],
  ['buenos días ¿cómo le va?', 'greeting'],
  ['buenas tardes disculpe la molestia', 'greeting'],
  ['hola profe', 'greeting'],
  ['hola, soy docente', 'greeting'],
  ['hola, soy auxiliar', 'greeting'],
  ['hola, soy director de una IE', 'greeting'],
  ['👋', 'greeting'],
  ['muchas gracias por todo', 'thanks'],
  ['gracias por la info', 'thanks'],
  ['Gracias por la información', 'thanks'],
  ['gracias, me sirvio mucho', 'thanks'],
  ['Muchas gracias por la información, fue muy útil', 'thanks'],
  ['gracias muy clara la respuesta', 'thanks'],
  ['Gracias, eso era todo', 'thanks'],
  ['excelente gracias', 'thanks'],
  ['perfecto, muchas gracias', 'thanks'],
  ['ok gracias', 'thanks'],
  ['Dios le pague', 'thanks'],
  ['ok', 'acknowledgment'],
  ['Ok, entendido', 'acknowledgment'],
  ['perfecto!', 'acknowledgment'],
  ['listo', 'acknowledgment'],
  ['de acuerdo', 'acknowledgment'],
  ['muy bien', 'acknowledgment'],
  ['👍', 'acknowledgment'],
  [':)', 'acknowledgment'],
  ['ok 👍', 'acknowledgment'],
  ['jaja', 'acknowledgment'],
  ['hasta mañana', 'farewell'],
  ['Que tenga buen día', 'farewell'],
  ['chau', 'farewell'],
  ['buenas tardes, tengo una consulta', 'ask_announcement'],
  ['hola quiero hacer una pregunta', 'ask_announcement'],
  ['hola, necesito ayuda', 'ask_announcement'],
  ['¿me puedes ayudar?', 'ask_announcement'],
  ['buenas tardes una consulta', 'ask_announcement'],
  ['¿Qué puedes hacer?', 'capabilities'],
  ['¿En qué me ayudas?', 'capabilities'],
  ['Soy directora, ¿en qué me puedes ayudar?', 'capabilities'],
  ['que temas manejas?', 'capabilities'],
  ['sobre que puedo preguntarte?', 'capabilities'],
  ['eres un robot?', 'capabilities'],
  ['¿Con quién hablo?', 'capabilities'],
  ['para que sirve esta pagina', 'capabilities'],
  ['ayuda!', 'capabilities'],
];

const OUT_OF_SCOPE = [
  'que tiempo hace hoy en lima',
  'va a llover mañana en arequipa?',
  'quien gano el clasico alianza universitario',
  'cuando juega peru en las eliminatorias',
  'dame una receta de lomo saltado',
  'como preparo un ceviche',
  'recomiendame una pelicula',
  'escríbeme un poema de amor',
  'escribe una carta de amor',
  'cuentame un chiste',
  'resuelve esta ecuacion 2x + 3 = 7',
  'cuanto es 25 por 48',
  'haz la tarea de matematica de mi hijo',
  'traduce esto al ingles: good morning',
  'escribe un codigo en python para ordenar una lista',
  'como arreglo mi laptop que no prende',
  'por quien voto en las elecciones',
  'que opinas del presidente',
  'me duele la cabeza que pastilla tomo',
  'tengo gripe que hago',
  'cual es el precio del dolar hoy',
  'conviene invertir en bitcoin',
  'como saco mi dni',
  'como tramito mi pasaporte',
  'como saco mi licencia de conducir',
  'horoscopo de leo',
  'quien es messi',
  'cual es la capital de francia',
  'que series de netflix recomiendas',
  'genera una imagen de un gato',
];

describe('classifyTurnIntent — batería de aceptación', () => {
  it.each(EDUCATIONAL_QUERIES)('consulta educativa al RAG: "%s"', (message) => {
    expect(classifyTurnIntent(message).lane).toBe('domain');
  });

  it.each(SOCIAL)('charla sin RAG: "%s" → %s', (message, subtype) => {
    expect(classifyTurnIntent(message)).toEqual({ lane: 'social', subtype });
  });

  it.each(OUT_OF_SCOPE)('ajena, se declina con amabilidad: "%s"', (message) => {
    expect(classifyTurnIntent(message)).toEqual({
      lane: 'out_of_scope',
      subtype: 'out_of_domain',
    });
  });

  it.each([
    'y la receta medica sirve?',
    'y si es por el clima?',
    'y si va a llover?',
  ])(
    'dentro de una conversación, un seguimiento breve usa el contexto: "%s"',
    (message) => {
      expect(classifyTurnIntent(message, { inConversation: true }).lane).toBe(
        'domain',
      );
    },
  );
});

describe('announcesNewTopic', () => {
  it.each([
    'otra consulta: ¿cuántos días de vacaciones tengo?',
    'Cambiando de tema, ¿cómo pido mi CTS?',
    'Ahora quiero saber sobre la permuta',
  ])('detecta el cambio de tema explícito: "%s"', (message) => {
    expect(announcesNewTopic(message)).toBe(true);
  });

  it.each(['¿Y cuál es el plazo?', '¿y para una permuta?', 'gracias'])(
    'un seguimiento no es un cambio de tema anunciado: "%s"',
    (message) => {
      expect(announcesNewTopic(message)).toBe(false);
    },
  );
});

describe('hasEducationalSignal', () => {
  it('distingue una consulta del ámbito de un pedido sin relación aparente', () => {
    expect(hasEducationalSignal('¿qué es el CNEB?')).toBe(true);
    expect(
      hasEducationalSignal('¿cuál es la mejor época para sembrar papa?'),
    ).toBe(false);
  });
});

describe('isTopiclessQuestion', () => {
  it.each([
    '¿Cuáles son los requisitos?',
    '¿Cuál es el plazo para presentar la solicitud?',
    '¿Qué documentos necesito?',
    '¿Dónde lo presento?',
  ])('pide precisar el trámite: "%s"', (message) => {
    expect(isTopiclessQuestion(message)).toBe(true);
  });

  it.each([
    '¿Cuáles son los requisitos para una reasignación?',
    '¿Qué dice la ley 29944 sobre el plazo?',
    'Buenos días, quisiera saber cuánto tiempo tiene un director para responder esta solicitud.',
    '¿Quién reemplaza al director cuando se encuentra de licencia?',
  ])('una consulta con tema o extensa va al RAG: "%s"', (message) => {
    expect(isTopiclessQuestion(message)).toBe(false);
  });
});

describe('regresiones de la revisión independiente (2026-09-24)', () => {
  it.each([
    '¿Qué sabes de la carrera pública magisterial?',
    '¿Qué sabes sobre el CNEB?',
    '¿Cómo se usa el SIAGIE para registrar las notas?',
    '¿Cómo me puedes ayudar con un alumno que sufre bullying?',
    '¿Para qué sirve la plataforma SIAGIE?',
    'Tengo covid, ¿debo ir a trabajar?',
    'Tengo fiebre, ¿tengo que ir a laborar mañana?',
    '¿Me pueden obligar a usar mi celular personal para comunicarme con los padres?',
    '¿Qué dice el DS 004-2013-ED?',
  ])('va al RAG: "%s"', (message) => {
    expect(classifyTurnIntent(message).lane).toBe('domain');
  });

  it.each([
    '¿Qué sabes?',
    'Soy docente, ¿en qué me puedes ayudar?',
    '¿cómo se usa?',
  ])('sigue siendo pregunta de capacidad: "%s"', (message) => {
    expect(classifyTurnIntent(message)).toEqual({
      lane: 'social',
      subtype: 'capabilities',
    });
  });

  it.each([
    '¿Cuáles son los requisitos para ser director?',
    '¿Cuáles son los requisitos para ser auxiliar de educación?',
    '¿Qué documentos piden para la PUN?',
    '¿Cuánto tiempo dura el periodo de prueba?',
  ])('una consulta con tema no pide precisar el tema: "%s"', (message) => {
    expect(isTopiclessQuestion(message)).toBe(false);
  });

  it('las abreviaturas y normas del sector cuentan como señal educativa', () => {
    expect(hasEducationalSignal('¿Qué dice el DS 004-2013-ED?')).toBe(true);
    expect(hasEducationalSignal('¿Qué beneficios da el CAFAE?')).toBe(true);
  });
});
