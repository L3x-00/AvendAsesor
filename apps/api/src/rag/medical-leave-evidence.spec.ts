import fixture from './fixtures/medical-leave.json';
import { medicalLeaveContextRequests } from './medical-leave-evidence';
import { verifiedMedicalLeaveAnswer } from './administrative-answer-safety';
import { resolveMedicalLeaveApplicability } from './medical-leave-applicability';
import { isMedicalLeaveQuestion } from './administrative-retrieval';
import type { RetrievedChunk } from './retrieval.gateway';

const P3 =
  'me dieron descanso medico por una semana, como presento mi licencia al colegio';
const P15 = 'soy auxiliar contratado y me enferme, puedo pedir descanso medico';
function sources(): RetrievedChunk[] {
  return fixture.flatMap((document, i) =>
    document.chunks.map((chunk) => ({
      chunkId: chunk.id,
      chunkContent: chunk.chunk_content,
      chunkIndex: chunk.chunk_index,
      documentVersionId: document.version,
      documentId: `document-${i}`,
      documentSituation: 'current' as const,
      documentTitle: i ? 'Auxiliares' : 'Profesores',
      moduleIds: [`module-${i}`],
      moduleNames: [
        i ? 'Auxiliar de educación' : 'Situaciones Administrativas',
      ],
      articleReference: chunk.article_reference,
      numeralReference: chunk.numeral_reference,
      sectionTitle: chunk.section_title,
      pageStart: chunk.page_start,
      pageEnd: chunk.page_end,
      lexicalScore: 0,
      semanticScore: 0.9,
      versionNumber: 1,
    })),
  );
}

const profile = (question: string) =>
  resolveMedicalLeaveApplicability([question], isMedicalLeaveQuestion)!;
const answer = (question: string, input = sources()) =>
  verifiedMedicalLeaveAnswer(profile(question), input);

describe('verified medical provisions', () => {
  it('P3 answers from the available regime conditionally and does not assign the user a role', () => {
    const result = answer(P3, sources().slice(0, 4))!;
    expect(result.answer).toContain('Si el descanso corresponde a profesores');
    expect(result.answer).toContain(
      '¿El descanso es de un profesor o de un auxiliar',
    );
    expect(result.answer).toContain('mesa de partes física o virtual');
    expect(result.answer).toContain('CM o CITT');
    expect(result.answer).toContain(
      'Receta médica suscrita por el médico que expide el CM',
    );
    expect(result.answer).toContain(
      'Requisito para el goce a partir del día veintiuno',
    );
    expect(result.answer).not.toContain('primeros veinte (20) días en el año');
    expect(result.sources.map((s) => s.pageStart)).toEqual([14, 16, 16, 18]);
  });

  it('P15 retains the whole auxiliary alternative and rejects teacher evidence despite ranking', () => {
    const result = answer(
      P15,
      sources().map((s, i) => ({ ...s, semanticScore: i < 4 ? 0.99 : 0.8 })),
    )!;
    expect(new Set(result.sources.map((s) => s.documentVersionId))).toEqual(
      new Set([fixture[1].version]),
    );
    expect(result.answer).toContain('sustenta desde el primer día de licencia');
    expect(result.answer).toContain('primeros veinte (20) días en el año');
    expect(result.answer).toContain(
      'recibo de compras de la medicina adquirida',
    );
    expect(result.answer).toContain('dentro de la vigencia del contrato');
    expect(result.answer).toContain('pudiendo adjuntar la constancia');
    expect(result.answer).toContain('A partir del día veintiuno (21)');
    expect(result.answer).toContain('presencial o virtual');
    expect(result.answer).not.toContain('tres (03) días hábiles');
  });

  it('selects distinct, complete closures for documents, filing deadlines, and hospital cases', () => {
    const questions = [
      'qué documentos adjunto',
      'cuál es el plazo para solicitar',
      'qué presento si estoy hospitalizada',
    ];
    const [documents, deadline, hospital] = questions.map(
      (q) => answer('Soy auxiliar, tengo descanso médico, ¿' + q + '?')!.answer,
    );
    expect(documents).toContain('Documentos alternativos');
    expect(documents).not.toContain('pudiendo adjuntar la constancia');
    expect(deadline).toContain('zona de frontera');
    expect(deadline).toContain('contados desde la contingencia');
    expect(deadline).toContain('no haya afectación a la continuidad');
    expect(deadline).not.toContain('receta médica');
    expect(hospital).toContain('pudiendo adjuntar la constancia');
    expect(hospital).toContain('dado de alta');
    expect(hospital).not.toContain('zona de frontera');
  });

  it('binds third-party evidence to the named target without rewriting the speaker', () => {
    const result = answer(
      'Soy profesor, pero pregunto por una auxiliar con descanso médico, ¿qué documentos presenta?',
    )!;
    expect(
      result.sources.every((s) => s.documentVersionId === fixture[1].version),
    ).toBe(true);
  });

  it('cites the deadline for the requested action and excludes the role the speaker denied', () => {
    const decision = answer(
      'Soy auxiliar. ¿Cuál es el plazo para que la UGEL resuelva mi solicitud de descanso médico?',
    )!;
    expect(decision.answer).toContain(
      'cinco (5) días hábiles de recibida la solicitud o subsanación',
    );
    expect(decision.answer).not.toContain('desde la contingencia');
    const profile = resolveMedicalLeaveApplicability(
      [
        P15,
        'No soy auxiliar. ¿Qué documentos presento para ese descanso médico?',
      ],
      isMedicalLeaveQuestion,
    )!;
    const result = verifiedMedicalLeaveAnswer(profile, sources())!;
    expect(new Set(result.sources.map((s) => s.documentVersionId))).toEqual(
      new Set([fixture[0].version]),
    );
    expect(result.answer).toContain('Si el descanso corresponde a profesores');
  });

  it('never opens context for incompatible, unadmitted or historical versions', () => {
    const scope = profile(P15);
    expect(medicalLeaveContextRequests(sources().slice(0, 4), scope)).toEqual(
      [],
    );
    expect(medicalLeaveContextRequests(sources(), scope)).toMatchObject([
      { versionId: fixture[1].version },
    ]);
    expect(
      medicalLeaveContextRequests(
        sources().map((s) => ({ ...s, documentSituation: 'archived' })),
        scope,
      ),
    ).toEqual([]);
  });

  it.each([0, 1, 2, 3, 4])(
    'requires complete surrounding auxiliary context chunk %i',
    (offset) => {
      const input = sources();
      input.splice(4 + offset, 1);
      expect(answer(P15, input)).toBeNull();
    },
  );

  it.each(['content', 'ordinal', 'pages', 'version', 'status'])(
    'rejects forged %s rather than swapping regimes',
    (field) => {
      const input = sources();
      const chunk = input[7];
      if (field === 'content') chunk.chunkContent += ' ambos son obligatorios';
      if (field === 'ordinal') chunk.chunkIndex = 999;
      if (field === 'pages') chunk.pageStart = 1;
      if (field === 'version') chunk.documentVersionId = 'other';
      if (field === 'status') chunk.documentSituation = 'replaced';
      expect(answer(P15, input)).toBeNull();
    },
  );

  it('refuses unrelated intent and preserves genuine citation identities', () => {
    expect(
      answer('Soy auxiliar, ¿puedo teletrabajar durante mi descanso médico?'),
    ).toBeNull();
    const input = sources();
    expect(answer(P15, input)).toEqual(answer(P15, [...input].reverse()));
    expect(
      answer(P15, input)?.sources.every((source) => input.includes(source)),
    ).toBe(true);
  });
});
