import {
  isLegalModuleName,
  isLegalQuestion,
  isLegalSource,
  isPrimaryLegalSource,
  legalEvidenceQueries,
  legalTopic,
  legalTopicNeedsPrimaryText,
  namesOtherLaw,
} from './legal-retrieval';

describe('legal-retrieval', () => {
  it('reconoce el módulo legal por su nombre', () => {
    expect(isLegalModuleName('Ley y reglamento')).toBe(true);
    expect(isLegalModuleName('Reglamento de la Ley de Reforma Magisterial')).toBe(
      true,
    );
    expect(isLegalModuleName('Remuneraciones')).toBe(false);
  });

  it('reconoce consultas jurídicas y sus materias', () => {
    expect(isLegalQuestion('¿Qué es la Ley N.º 29944?')).toBe(true);
    expect(isLegalQuestion('¿Cuáles son los derechos de los docentes?')).toBe(
      true,
    );
    expect(isLegalQuestion('¿Cuánto gana un docente?')).toBe(false);
    expect(legalTopic('¿Cuáles son los deberes de los docentes?')).toBe(
      'duties',
    );
    expect(legalTopic('¿Puedo solicitar licencia por motivos particulares?')).toBe(
      'licenses',
    );
    expect(
      legalTopic('¿En qué casos un docente pierde el nombramiento?'),
    ).toBe('sanctions');
  });

  it('exige el texto primario solo en las materias que lo necesitan', () => {
    expect(legalTopicNeedsPrimaryText('rights')).toBe(true);
    expect(legalTopicNeedsPrimaryText('duties')).toBe(true);
    expect(legalTopicNeedsPrimaryText('modification')).toBe(true);
    expect(legalTopicNeedsPrimaryText('sanctions')).toBe(false);
    expect(legalTopicNeedsPrimaryText('licenses')).toBe(false);
  });

  it('no confunde la ley con una norma que la cita', () => {
    expect(
      isPrimaryLegalSource({ documentTitle: 'Ley N.º 29944, Ley de Reforma Magisterial' }),
    ).toBe(true);
    expect(
      isPrimaryLegalSource({ documentTitle: 'Ley N.° 29944' }),
    ).toBe(true);
    expect(
      isPrimaryLegalSource({
        documentTitle: 'Norma Técnica de licencias, permisos y vacaciones de profesores',
      }),
    ).toBe(false);
    expect(
      isLegalSource({
        chunkContent: 'Licencia por motivos particulares del profesor nombrado.',
        documentTitle:
          'Norma Técnica de licencias, permisos y vacaciones de profesores',
      }),
    ).toBe(true);
  });

  it('distingue la Ley 29944 de otra ley nombrada', () => {
    expect(namesOtherLaw('¿Qué establece la Ley N.º 29988?')).toBe(true);
    expect(namesOtherLaw('¿Qué establece la Ley N.º 29944?')).toBe(false);
    expect(namesOtherLaw('¿Qué es la Ley de Reforma Magisterial?')).toBe(false);
  });

  it('clasifica materias genéricas y no adelanta derechos o reglamento', () => {
    expect(legalTopic('¿Qué norma regula la carrera pública magisterial?')).toBe(
      'generic',
    );
    expect(
      legalTopic('¿Qué derechos tengo si me niegan una licencia?'),
    ).toBe('rights');
    expect(legalTopic('¿Qué dice el artículo 5 del reglamento?')).toBe(
      'regulation',
    );
    expect(legalTopicNeedsPrimaryText('generic')).toBe(true);
  });

  it('solo amplía la búsqueda legal dentro del módulo legal', () => {
    expect(legalEvidenceQueries('¿Qué es la Ley N.º 29944?')).toEqual([]);
    expect(legalEvidenceQueries('¿Qué es la Ley N.º 29944?', true)).toContain(
      'Ley 29944 Ley de Reforma Magisterial reglamento Decreto Supremo 004-2013-ED artículos vigencia',
    );
  });

  it('prioriza consultas específicas y no arrastra la ley a cualquier trámite', () => {
    expect(
      legalEvidenceQueries(
        '¿Puedo solicitar licencia por motivos particulares?',
        true,
      ),
    ).toEqual([
      'licencia por motivos particulares profesores requisitos norma técnica licencias permisos vacaciones',
      '5.20 licencia por motivos particulares dos años continuos o discontinuos período cinco años docente nombrado',
    ]);
    expect(legalEvidenceQueries('¿Cuánto gana un docente?')).toEqual([]);
    expect(
      legalEvidenceQueries('¿Qué es la Ley N.º 29944?', true),
    ).toContain(
      'Ley 29944 Ley de Reforma Magisterial reglamento Decreto Supremo 004-2013-ED artículos vigencia',
    );
  });
});
