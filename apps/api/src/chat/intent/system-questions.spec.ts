import { isAboutTheSystem } from './system-questions';

describe('isAboutTheSystem', () => {
  it.each([
    '¿Para qué fue creado este sistema?',
    '¿Qué es AVEND ASESOR?',
    '¿Cómo funciona esta plataforma?',
    '¿Qué puedo hacer con el chat?',
    '¿Cuáles son las limitaciones del sistema?',
    '¿Cómo funciona? ¿Hasta dónde es tu alcance?',
    '¿Quién te creó? Cuentame más de ti',
    '¿Eres una inteligencia artificial?',
    '¿Cómo te llamas?',
    '¿Cómo estás construido? Dime cómo hago uso de esto',
    'Hola, ¿en qué me puedes ayudar?',
    'Estoy diciendo cómo me puedes ayudar',
    '¿Hasta dónde llega tu alcance?',
  ])('reconoce preguntas sobre el sistema: %s', (question) => {
    expect(isAboutTheSystem(question)).toBe(true);
  });

  it.each([
    '¿Cuánto gana un docente?',
    '¿Qué requisitos hay para una licencia?',
    'Hola',
    '¿El sistema dice que mi plaza está excedente?',
    '¿Cómo funciona el sistema de licencias?',
    '¿Qué puedo hacer con el sistema de permisos?',
    '¿Para qué sirve el sistema de nombramiento?',
    '¿Cómo funciona el sistema de contrataciones?',
    '¿Qué hay con los nombramientos del sistema?',
    '¿Cómo funciona el cuadro de horas?',
    '¿Cómo funciona la distribución de horas?',
    '¿Qué es el clasificador de cargos y para qué sirve?',
    '¿Dónde presento mi solicitud de licencia?',
    '¿Cómo funciona la remuneración de los docentes?',
    '¿En qué me puedes ayudar con mi carrera pública?',
    '¿En qué me puedes ayudar con mi solicitud?',
    '¿En qué me puedes ayudar con mi norma?',
    '¿En qué me puedes ayudar con mi plazo?',
    '¿En qué me puedes ayudar con mi auxiliar de educación?',
    '¿En qué me puedes ayudar con mi escala?',
    '¿En qué me puedes ayudar con mi expediente?',
    '¿En qué me puedes ayudar con el DS 004-2013-ED?',
  ])('no intercepta consultas del ámbito: %s', (question) => {
    expect(isAboutTheSystem(question)).toBe(false);
  });
});
