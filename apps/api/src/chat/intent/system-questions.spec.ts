import { isAboutTheSystem } from './system-questions';

describe('isAboutTheSystem', () => {
  it.each([
    '¿Para qué fue creado este sistema?',
    '¿Qué es AVEND ASESOR?',
    '¿Cómo funciona esta plataforma?',
    '¿Qué puedo hacer con el chat?',
    '¿Cuáles son las limitaciones del sistema?',
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
  ])('no intercepta consultas del ámbito: %s', (question) => {
    expect(isAboutTheSystem(question)).toBe(false);
  });
});
