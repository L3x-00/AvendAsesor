import {
  verifiedRemovalAnswer,
  verifiedTeacherRequirementsAnswer,
} from './verified-coverage-answer';
import type { RetrievedChunk } from './retrieval.gateway';

function chunk(
  content: string,
  title = 'Ley N 29944, Ley de Reforma Magisterial',
): RetrievedChunk {
  return {
    articleReference: null,
    chunkContent: content,
    chunkId: 'chunk-1',
    documentId: 'doc-1',
    documentSituation: 'current',
    documentTitle: title,
    documentVersionId: 'version-1',
    lexicalScore: 0.5,
    moduleIds: ['module-1'],
    moduleNames: ['Ley y reglamento'],
    numeralReference: null,
    pageEnd: 6,
    pageStart: 6,
    sectionTitle: null,
    semanticScore: 0.9,
    versionNumber: 1,
  };
}

const REQ_Q = '¿Qué se requiere para ser docente?';
const REM_Q = '¿Cuándo un director es removido de su cargo?';

describe('respuesta verificada de requisitos docentes', () => {
  it('responde con el Art. 18 cuando la pregunta y el fragmento coinciden', () => {
    const source = chunk(
      'Artículo 18. Requisitos para postular a la Carrera Pública Magisterial. Para participar en el concurso público de acceso a una plaza vacante se requiere: a) Poseer título de profesor o de licenciado en educación, otorgado por una institución de formación docente acreditada en el país o en el exterior.',
    );
    const result = verifiedTeacherRequirementsAnswer(REQ_Q, [source]);
    expect(result).not.toBeNull();
    expect(result?.answer).toContain('título de profesor');
    expect(result?.answer).toContain(
      'institución de formación docente acreditada',
    );
    expect(result?.answer).toContain('[1]');
    expect(result?.sources).toEqual([source]);
  });

  it('no emite respuesta si la pregunta no pide requisitos docentes', () => {
    const source = chunk(
      'Para postular a la Carrera Pública Magisterial se requiere título de profesor.',
    );
    expect(
      verifiedTeacherRequirementsAnswer('¿cuánto gana un docente?', [source]),
    ).toBeNull();
    expect(
      verifiedTeacherRequirementsAnswer('¿quién decide las horas?', [source]),
    ).toBeNull();
  });

  it('rechaza la encargatura y la renovación aunque mencionen requisitos', () => {
    const encargatura = chunk(
      'Los requisitos para postular a una encargatura: estar sin inhabilitación y contar con título de profesor.',
      'Anexo 6 de la RVM 098-2025',
    );
    const renovacion = chunk(
      'Condiciones para la renovación: haber sido contratado con título de profesor o licenciado en Educación.',
      'Renovación del contrato docente 2026',
    );
    expect(verifiedTeacherRequirementsAnswer(REQ_Q, [encargatura])).toBeNull();
    expect(verifiedTeacherRequirementsAnswer(REQ_Q, [renovacion])).toBeNull();
  });

  it('no afirma "acreditada" si el fragmento no lo dice', () => {
    const source = chunk(
      'Artículo 18. Requisitos para postular: poseer título de profesor o licenciado en educación.',
    );
    const result = verifiedTeacherRequirementsAnswer(REQ_Q, [source]);
    expect(result?.answer).not.toContain('acreditada');
  });
});

describe('robustez ante cambio de documento (paso 4)', () => {
  it('responde igual si otra norma distinta trae el mismo contenido', () => {
    const otraNorma = {
      ...chunk(
        'Artículo 4. Para ser docente se requiere título de profesor o licenciado en educación y cumplir los requisitos generales de postulación.',
        'Norma de formación docente 2030',
      ),
      documentId: 'otro-documento-id',
      documentVersionId: 'otra-version-id',
      chunkId: 'otro-chunk-id',
    };
    const result = verifiedTeacherRequirementsAnswer(REQ_Q, [otraNorma]);
    expect(result).not.toBeNull();
    expect(result?.sources).toEqual([otraNorma]);
    expect(result?.answer).toContain('título de profesor');
  });

  it('la remoción también responde desde otra fuente con el mismo contenido', () => {
    const otraNorma = {
      ...chunk(
        'Las sanciones son suspensión en el cargo, cese temporal y destitución del servicio, previo proceso administrativo disciplinario.',
        'Reglamento disciplinario 2031',
      ),
      documentId: 'otro-documento-id-2',
      documentVersionId: 'otra-version-id-2',
      chunkId: 'otro-chunk-id-2',
    };
    const result = verifiedRemovalAnswer(REM_Q, [otraNorma]);
    expect(result).not.toBeNull();
    expect(result?.sources).toEqual([otraNorma]);
  });

  it('si la fuente preferida desaparece y no hay otra válida, no inventa', () => {
    const soloAjena = chunk(
      'La encargatura exige impedimentos y requisitos para postular.',
      'Anexo 6 de la RVM 098-2025',
    );
    expect(verifiedTeacherRequirementsAnswer(REQ_Q, [soloAjena])).toBeNull();
    expect(verifiedRemovalAnswer(REM_Q, [soloAjena])).toBeNull();
  });
});

describe('respuesta verificada de remoción del cargo', () => {
  const sanciones = chunk(
    'Las sanciones son: a) Amonestación escrita. b) Suspensión en el cargo hasta por treinta (30) días sin goce de remuneraciones. c) Cese temporal en el cargo desde treinta y un (31) días hasta doce (12) meses. d) Destitución del servicio. Las sanciones de cese temporal y destitución se aplican previo proceso administrativo disciplinario.',
  );

  it('responde con las sanciones cuando la pregunta y el fragmento coinciden', () => {
    const result = verifiedRemovalAnswer(REM_Q, [sanciones]);
    expect(result).not.toBeNull();
    expect(result?.answer).toContain('cese temporal');
    expect(result?.answer).toContain('destitución');
    expect(result?.answer).toContain(
      'previo proceso administrativo disciplinario',
    );
    expect(result?.answer).toContain('[1]');
    expect(result?.sources).toEqual([sanciones]);
  });

  it('no emite respuesta si la pregunta no pide remoción', () => {
    expect(
      verifiedRemovalAnswer('¿cuánto gana un docente?', [sanciones]),
    ).toBeNull();
    expect(
      verifiedRemovalAnswer('¿quién decide las horas?', [sanciones]),
    ).toBeNull();
  });

  it('rechaza descargos del PAD, reasignación y encargatura', () => {
    expect(
      verifiedRemovalAnswer(REM_Q, [
        chunk(
          'El procesado tiene derecho a presentar el descargo por escrito.',
        ),
      ]),
    ).toBeNull();
    expect(
      verifiedRemovalAnswer(REM_Q, [
        chunk(
          'Cese temporal, amonestación escrita y proceso administrativo disciplinario en la reasignación docente.',
          'Reasignación docente',
        ),
      ]),
    ).toBeNull();
    expect(
      verifiedRemovalAnswer(REM_Q, [
        chunk(
          'Impedimentos para postular a una encargatura: suspensión o cese temporal en el cargo.',
          'Anexo 6 de la RVM 098-2025',
        ),
      ]),
    ).toBeNull();
  });

  it('no afirma "previo PAD" si el fragmento no lo dice', () => {
    const source = chunk(
      'El cese temporal en el cargo desde treinta y un (31) días hasta doce (12) meses y la destitución del servicio son sanciones.',
    );
    const result = verifiedRemovalAnswer(REM_Q, [source]);
    expect(result?.answer).not.toContain('previo proceso');
  });
});
