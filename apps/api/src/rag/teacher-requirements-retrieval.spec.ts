import {
  isTeacherRequirementsQuestion,
  teacherRequirementsEvidenceQueries,
} from './teacher-requirements-retrieval';
import { INTENT_EXPANSIONS } from './intent-routing.config';

describe('requisitos para ser docente', () => {
  it.each([
    '¿Qué se requiere para ser docente?',
    'qué requisitos se necesita para ser docente educativo',
    '¿Qué necesito para ser profesor?',
    '¿Qué se exige para ser maestra?',
    '¿Cuáles son las condiciones para ser docente?',
    '¿Qué se pide para llegar a ser profesor?',
    '¿qué requisitos para enseñar?',
    '¿qué se necesita para dar clases?',
    '¿qué requisitos para ser licenciado en educación?',
    '¿qué se pide para postular a la CPM?',
  ])('reconoce la pregunta: %s', (question) => {
    expect(isTeacherRequirementsQuestion(question)).toBe(true);
    expect(teacherRequirementsEvidenceQueries(question)).toEqual([
      INTENT_EXPANSIONS.TEACHING_REQUIREMENTS_PROCESS,
    ]);
  });

  it.each([
    '¿Cuánto gana un docente?',
    '¿Qué requisitos hay para una licencia?',
    '¿Qué requisitos se exigen para ser auxiliar de educación?',
    '¿Qué necesito para la contratación docente 2026?',
    '¿Qué se requiere para ser director?',
    '¿Cuáles son los requisitos para un nombramiento?',
    '¿Qué requisitos para una beca de posgrado?',
    '¿qué requisitos para un docente contratado?',
    'hola, ¿cómo estás?',
  ])('no la confunde con otro trámite: %s', (question) => {
    expect(isTeacherRequirementsQuestion(question)).toBe(false);
    expect(teacherRequirementsEvidenceQueries(question)).toEqual([]);
  });

  it('la expansión nombra el contenido, no un documento concreto', () => {
    const [query] = teacherRequirementsEvidenceQueries(
      '¿Qué se requiere para ser docente?',
    );
    expect(query).toContain('título de profesor');
    expect(query).toContain('licenciado en educación');
    expect(query).toContain('Ley 29944');
    // No apunta a un ID ni a un título de archivo: si el documento cambia,
    // otra fuente con el mismo contenido puede responder.
    expect(query).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/iu);
    expect(query).not.toContain('.pdf');
    // Robustez: la expansión es vocabulario (incluye el nombre de la norma),
    // pero no un identificador: sin id, versión, ruta de storage ni número de
    // resolución. Si la norma cambia, otra con el mismo contenido responde.
    expect(query).not.toMatch(/\b(?:version|storage|uuid|id)[_:\s-]/iu);
    expect(query).not.toMatch(/\b\d{3,4}-\d{4}\b/u);
  });
});
