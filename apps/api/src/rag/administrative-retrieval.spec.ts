import {
  administrativeEvidenceQueries,
  isDirectAdministrativeEvidence,
} from './administrative-retrieval';

function source(
  chunkContent: string,
  extra: { documentTitle?: string; moduleNames?: string[] } = {},
) {
  return {
    chunkContent,
    documentTitle: extra.documentTitle ?? 'Norma administrativa',
    moduleNames: extra.moduleNames,
  };
}

describe('administrativeEvidenceQueries', () => {
  it('lleva un descanso médico a licencia por incapacidad temporal, no a permiso por horas', () => {
    expect(
      administrativeEvidenceQueries(
        'Soy profesor nombrado y estoy enfermo, cuantos dias puedo faltar con descanso medico',
      ),
    ).toContain(
      'licencia por incapacidad temporal descanso médico CITT certificado médico',
    );
  });

  it.each([
    'me dieron descanso medico por una semana, como presento mi licencia al colegio',
    'soy auxiliar contratado y me enferme, puedo pedir descanso medico',
    'no soy auxiliar, soy profesor, ¿cómo pido descanso médico?',
    'soy auxiliar y pregunto si un profesor hospitalizado presenta receta durante el descanso médico',
  ])(
    'does not assign a profession through the medical expansion: %s',
    (question) => {
      expect(administrativeEvidenceQueries(question)).toEqual([
        'licencia por incapacidad temporal descanso médico CITT certificado médico',
      ]);
    },
  );

  it.each([
    [
      'necesito faltar dos dias al colegio por motivos personales',
      'permiso por motivos particulares profesor nombrado ausencia por horas requisitos',
    ],
    [
      'si soy contratado tambien tengo derecho a vacaciones o solo los nombrados',
      'vacaciones profesores nombrados contratados Carrera Pública Magisterial',
    ],
    [
      'mi director me quiere descontar por llegar tarde 10 minutos',
      'tardanza descuento asistencia tercera tardanza factor minuto jornada laboral profesor',
    ],
    [
      'un docente puede ser sancionado sin que le permitan defenderse',
      'proceso administrativo disciplinario docente derecho de defensa descargos notificación',
    ],
    [
      'trabajo 30 horas en secundaria pero quiero saber si todas son horas de clase',
      'jornada de trabajo profesor secundaria horas pedagógicas horas lectivas',
    ],
  ])(
    'reconoce una consulta administrativa coloquial: %s',
    (question, expected) => {
      expect(administrativeEvidenceQueries(question)).toContain(expected);
    },
  );

  it('no convierte una notificación ajena al PAD en una búsqueda disciplinaria', () => {
    expect(
      administrativeEvidenceQueries('No veo la notificación de mi boleta'),
    ).toEqual([]);
  });

  it.each([
    '¿Cómo reclamo una nota de mi hijo?',
    '¿Cuál es el horario de atención de la biblioteca?',
    '¿Qué actividades complementarias hace un estudiante?',
  ])(
    'no convierte una consulta ajena en una búsqueda administrativa: %s',
    (question) => {
      expect(administrativeEvidenceQueries(question)).toEqual([]);
    },
  );

  it.each([
    'cuando te pueden botar de tu plaza de contrato?',
    'cuando te sacan de tu contrato?',
    'me pueden despedir de mi contrato?',
    'no me renuevan el contrato, que pasa?',
  ])(
    'traduce el término coloquial del contrato a la denominación del corpus: %s',
    (question) => {
      expect(administrativeEvidenceQueries(question)).toContain(
        'conclusión del contrato docente causales de conclusión del contrato término del contrato no renovación del contrato',
      );
    },
  );

  it.each([
    // Funciona hoy con la consulta literal: no se le añade otra expansión.
    '¿Cómo renuncio a mi contrato docente?',
    // Sin «contrato» puede ser un cese, un destaque o una reasignación.
    'me botan de mi plaza',
    'me echaron de mi cargo',
    'me separaron de mi puesto',
    // «sacar» no es «sacar de»: obtener el contrato no es terminarlo.
    '¿dónde saco el contrato de trabajo?',
    '¿cuándo termina el año escolar?',
  ])(
    'no inventa un término de contrato donde la consulta no lo pide: %s',
    (question) => {
      expect(administrativeEvidenceQueries(question)).not.toContain(
        'conclusión del contrato docente causales de conclusión del contrato término del contrato no renovación del contrato',
      );
    },
  );
});

describe('isDirectAdministrativeEvidence', () => {
  it('preserves the requested vacation procedure when medical leave is an antecedent', () => {
    const question =
      'Soy profesora nombrada. ¿Qué documentos presento para solicitar vacaciones después de mi descanso médico?';
    expect(administrativeEvidenceQueries(question)).toEqual([
      'vacaciones profesores nombrados contratados Carrera Pública Magisterial',
    ]);
    expect(
      isDirectAdministrativeEvidence(
        question,
        source('Vacaciones de la Carrera Pública Magisterial'),
      ),
    ).toBe(true);
    expect(
      isDirectAdministrativeEvidence(
        question,
        source(
          'Licencia por incapacidad temporal. El CITT sustenta el descanso médico.',
        ),
      ),
    ).toBe(false);
  });
  it('prefiere la licencia por incapacidad temporal frente a la licencia por asistencia médica', () => {
    const question =
      'Estoy enfermo, ¿cuántos días puedo faltar con descanso médico?';
    expect(
      isDirectAdministrativeEvidence(
        question,
        source(
          '5.4 Licencia por incapacidad temporal. La solicitud se sustenta con CITT o certificado médico.',
        ),
      ),
    ).toBe(true);
    expect(
      isDirectAdministrativeEvidence(
        question,
        source(
          'Licencia por asistencia médica y terapia de rehabilitación: se otorga por horas.',
        ),
      ),
    ).toBe(false);
  });

  it('reserva la fuente que regula la defensa y no solo una sanción incidental', () => {
    const question =
      '¿Un docente puede ser sancionado sin que le permitan defenderse?';
    expect(
      isDirectAdministrativeEvidence(
        question,
        source(
          'El proceso administrativo disciplinario reconoce el derecho de defensa, descargos y notificación.',
        ),
      ),
    ).toBe(true);
    expect(
      isDirectAdministrativeEvidence(
        question,
        source('Las sanciones se registran en el escalafón.'),
      ),
    ).toBe(false);
  });

  it.each([
    'cuando te pueden botar de tu plaza de contrato?',
    'cuando te sacan de tu contrato?',
  ])(
    'admite la norma que regula la conclusión del contrato: %s',
    (question) => {
      expect(
        isDirectAdministrativeEvidence(
          question,
          source(
            'La conclusión del contrato docente se produce por el término del plazo, la renuncia, el fallecimiento y las causales establecidas en la norma.',
          ),
        ),
      ).toBe(true);
      // La norma de renovación dice cómo continuar, no cuándo termina.
      expect(
        isDirectAdministrativeEvidence(
          question,
          source(
            'Renovación del contrato docente 2026: condiciones para continuar en la plaza.',
          ),
        ),
      ).toBe(false);
    },
  );

  it('decide el régimen de la conclusión del contrato por el catálogo y la pregunta', () => {
    const auxiliarNorm = source(
      'Son causales de conclusión del contrato el término del plazo y la renuncia.',
      {
        documentTitle: 'Norma que regula la contratación de auxiliares',
        moduleNames: ['Auxiliares de educación'],
      },
    );
    expect(
      isDirectAdministrativeEvidence(
        'cuando te pueden botar de tu plaza de contrato?',
        auxiliarNorm,
      ),
    ).toBe(false);
    // El catálogo identifica el régimen aunque el título no lo nombre.
    expect(
      isDirectAdministrativeEvidence(
        'cuando te pueden botar de mi contrato?',
        source('Causales de conclusión del contrato: término del plazo.', {
          documentTitle: 'Norma técnica de contratación',
          moduleNames: ['Auxiliares de educación'],
        }),
      ),
    ).toBe(false);
    // La pregunta del auxiliar conserva su propia norma.
    expect(
      isDirectAdministrativeEvidence(
        'cuando te sacan de tu contrato como auxiliar de educacion?',
        auxiliarNorm,
      ),
    ).toBe(true);
  });
});
