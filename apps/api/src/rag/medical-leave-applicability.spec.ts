import { isMedicalLeaveQuestion } from './administrative-retrieval';
import {
  medicalSubjectIn,
  resolveMedicalLeaveApplicability,
} from './medical-leave-applicability';

const resolve = (...turns: string[]) =>
  resolveMedicalLeaveApplicability(turns, isMedicalLeaveQuestion);

describe('medical leave applicability', () => {
  it.each([
    ['Soy auxiliar y necesito licencia', 'self', 'auxiliar'],
    ['No soy auxiliar, soy profesor', 'self', 'docente'],
    [
      'No soy auxiliar sino profesor. ¿Qué documentos presento para mi descanso médico?',
      'self',
      'docente',
    ],
    ['Soy profesor, pero pregunto por una auxiliar', 'third_party', 'auxiliar'],
    ['Me dieron descanso médico', 'self', null],
    [
      'Soy auxiliar. El descanso médico es para un profesor. ¿Qué documentos adjunto?',
      'third_party',
      'docente',
    ],
    ['Soy auxiliar, mi sobrino está enfermo', 'third_party', null],
    [
      'Soy auxiliar, ¿puede mi director presentar un descanso médico?',
      'unspecified',
      null,
    ],
    [
      'Soy auxiliar, mi sobrino tiene descanso médico, ¿cómo presenta su licencia?',
      'third_party',
      null,
    ],
    ['Soy auxiliar de enfermería y necesito licencia', 'self', null],
    [
      'Soy auxiliar. Mi sobrino de 12 años tiene descanso médico, ¿cómo presento los documentos?',
      'third_party',
      null,
    ],
    [
      'Un profesor presenta los documentos para el descanso médico de una auxiliar. ¿Qué documentos adjunta?',
      'third_party',
      'auxiliar',
    ],
    [
      'Soy auxiliar. Un profesor tiene descanso médico, pero ¿qué documentos adjunto a mi licencia por incapacidad temporal?',
      'unspecified',
      null,
    ],
    [
      '¿Soy auxiliar? Me dieron descanso médico. ¿Qué documentos presento?',
      'self',
      null,
    ],
    [
      'Soy auxiliar. No es mi descanso médico. ¿Qué documentos se presentan?',
      'unspecified',
      null,
    ],
    [
      'Mi colega dijo «soy auxiliar», ¿puedo solicitar descanso médico?',
      'unspecified',
      null,
    ],
  ])(
    'binds the person affected independently of the speaker: %s',
    (question, subject, regime) => {
      expect(medicalSubjectIn(question)).toMatchObject({ subject, regime });
    },
  );

  it('changes regime after several consecutive turns and tracks the declaration', () => {
    const turns = [
      'Soy auxiliar, me dieron descanso médico',
      '¿Y los documentos?',
      '¿Y ese plazo?',
      'No soy auxiliar, soy profesor',
      '¿Y el plazo?',
    ];
    expect(resolve(...turns)).toMatchObject({
      subject: 'self',
      regime: 'docente',
      intent: 'deadline',
      confirmation: 'inherited',
      regimeTurn: 3,
    });
    expect(
      resolve(
        ...turns.slice(0, 3),
        '¿Qué es reasignación?',
        'No soy auxiliar, soy profesor',
        '¿Y el plazo?',
      ),
    ).toBeNull();
  });

  it('cannot transfer the role of a third party when the person changes', () => {
    expect(
      resolve(
        'Soy profesor, pero pregunto por una auxiliar con descanso médico, ¿qué documentos presenta?',
        '¿Y si estoy hospitalizada?',
      ),
    ).toMatchObject({
      subject: 'self',
      regime: null,
      intent: 'hospitalization',
    });
  });

  it('preserves the confirmed target for an explicit reference to the same leave', () => {
    const q = 'Soy auxiliar. ¿Qué documentos presento para mi descanso médico?';
    expect(
      resolve(
        q,
        '¿Y en ese descanso médico el CITT y el certificado son alternativos?',
      ),
    ).toMatchObject({
      regime: 'auxiliar',
      confirmation: 'inherited',
      regimeTurn: 0,
    });
    expect(
      resolve(q, 'Soy profesor, pero pregunto por una auxiliar'),
    ).toMatchObject({
      subject: 'third_party',
      regime: 'auxiliar',
      regimeTurn: 1,
      intent: 'documents',
    });
    expect(
      resolve(
        q,
        '¿Puedo tomar vacaciones después de mi descanso médico?',
        '¿Y ese plazo?',
      ),
    ).toBeNull();
    expect(resolve('Me dieron descanso médico', 'Profesor')).toMatchObject({
      subject: 'self',
      regime: 'docente',
      confirmation: 'explicit',
      subjectTurn: 0,
      regimeTurn: 1,
    });
  });

  it.each([
    'Soy docente nombrado. ¿Qué documentos presento para solicitar vacaciones después de mi descanso médico?',
    'Soy profesora nombrada. ¿Cuál es el plazo para pedir vacaciones después de mi descanso médico?',
    'Soy profesora. ¿Cómo presento mi solicitud de vacaciones después de mi descanso médico?',
  ])(
    'does not substitute incapacity for a request about another procedure: %s',
    (question) => {
      expect(resolve(question)).toBeNull();
    },
  );

  it.each([
    'Ese descanso médico no es mío, es de mi sobrino. ¿Qué documentos adjunto?',
    'No es mi descanso médico, es de mi sobrino. ¿Qué plazo tiene esa licencia?',
    'Soy auxiliar. Mi sobrino recibió descanso médico. ¿Qué documentos adjunto?',
    'Soy auxiliar. Ese descanso médico no es para un profesor. ¿Qué documentos adjunto?',
  ])(
    'clears the inherited regime when the referred leave changes beneficiary: %s',
    (question) => {
      expect(
        resolve(
          'Soy auxiliar, me dieron descanso médico. ¿Cómo presento mi licencia?',
          question,
        ),
      ).toMatchObject({
        subject: 'third_party',
        regime: null,
        confirmation: 'unresolved',
        regimeTurn: null,
      });
    },
  );

  it('treats an explicitly qualified third party as a new beneficiary without assuming eligibility', () => {
    expect(
      resolve(
        'Soy auxiliar. Ese descanso médico es de un profesor jubilado, ¿qué documentos adjunto?',
      ),
    ).toMatchObject({ subject: 'third_party', regime: null });
  });

  it.each([
    ['entregar el CITT', 'citt_deadline'],
    ['que la UGEL resuelva mi solicitud', 'resolution_deadline'],
    ['que el director remita mi solicitud', 'forwarding_deadline'],
  ])(
    'carries the action addressed by the deadline when it is named by a deictic: %s',
    (action, intent) => {
      const question = `Soy auxiliar, tengo descanso médico. ¿Qué plazo hay para ${action}?`;
      expect(resolve(question, '¿Y ese plazo?')).toMatchObject({
        regime: 'auxiliar',
        intent,
      });
    },
  );

  it.each([
    'No soy auxiliar. ¿Qué documentos presento para ese descanso médico?',
    'No soy auxiliar. ¿Y ese CITT?',
  ])('does not inherit a role excluded in a follow-up: %s', (question) => {
    expect(
      resolve('Soy auxiliar, me dieron descanso médico', question),
    ).toMatchObject({
      regime: null,
      confirmation: 'unresolved',
      regimeTurn: null,
    });
  });

  it.each([
    ['Me dieron descanso médico, cómo presento mi licencia', 'procedure'],
    [
      'Soy auxiliar contratado y me enfermé, puedo pedir descanso médico',
      'eligibility',
    ],
    ['¿Qué documentos adjunto para descanso médico?', 'documents'],
    ['¿Cuál es el plazo para solicitar descanso médico?', 'deadline'],
    [
      'Soy auxiliar. ¿Qué plazo tengo para entregar el CITT por descanso médico?',
      'citt_deadline',
    ],
    [
      'Soy auxiliar. No estoy hospitalizado. ¿Qué documentos presento para mi descanso médico?',
      'documents',
    ],
    [
      '¿Qué presento si estoy hospitalizado y tengo descanso médico?',
      'hospitalization',
    ],
    [
      'Soy docente. Tengo descanso médico, no es por hospitalización. ¿Qué documentos adjunto?',
      'documents',
    ],
    [
      'Soy docente. Tengo descanso médico y nunca estuve hospitalizada. ¿Qué documentos adjunto?',
      'documents',
    ],
    [
      'Soy auxiliar. Mi sobrino está hospitalizado. Tengo descanso médico. ¿Qué documentos adjunto para mi licencia?',
      'documents',
    ],
    [
      'Soy auxiliar. Estoy hospitalizada. Tengo descanso médico. ¿Qué documentos adjunto?',
      'hospitalization',
    ],
    ['¿Puedo teletrabajar con descanso médico?', 'unsupported'],
    ['¿Puedo viajar durante mi descanso médico si tengo CITT?', 'unsupported'],
    [
      'Soy auxiliar. ¿Puedo pedir licencia para cuidar a mi sobrino que tiene descanso médico?',
      'unsupported',
    ],
    [
      'Soy auxiliar. ¿Qué documentos presento para mi descanso médico después de vacaciones?',
      'documents',
    ],
  ])('selects the question intent: %s', (question, intent) => {
    expect(resolve(question)?.intent).toBe(intent);
  });
});
