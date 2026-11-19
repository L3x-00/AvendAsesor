/**
 * Preguntas recomendadas para la pantalla inicial del chat de un tema.
 *
 * Cada módulo tiene procesos distintos, así que las frases de ejemplo cambian
 * con él: una pregunta sobre «remuneraciones» no sirve para «cargos y plazas».
 * El módulo llega del API con nombre y código; el código manda y, si cambió,
 * el nombre lo reconoce por palabra clave. Un tema nuevo recibe preguntas
 * genéricas redactadas con su propio nombre, nunca las de otro módulo.
 */

export interface StarterTopic {
  code?: string | null;
  name?: string | null;
}

interface StarterGroup {
  codes: readonly string[];
  keywords: readonly string[];
  starters: readonly string[];
}

/** Sin tildes, en mayúsculas y con espacios simples: «Remuneración» = «REMUNERACION». */
function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("es")
    .replace(/\s+/g, " ")
    .trim();
}

const STARTER_GROUPS: readonly StarterGroup[] = [
  {
    codes: ["CONTRATACION_DESPLAZAMIENTOS", "CONTRATACION_Y_DESPLAZAMIENTOS"],
    keywords: ["CONTRATACION Y DESPLAZAMIENTO"],
    starters: [
      "¿Qué requisitos necesito para postular a una plaza de contratación docente?",
      "¿Cómo se solicita una encargatura docente?",
      "¿Qué plazos rigen para una reasignación o permuta docente?",
      "¿Qué condiciones se piden para el destaque docente?",
    ],
  },
  {
    codes: ["REMUNERACIONES"],
    keywords: ["REMUNERACION"],
    starters: [
      "¿Qué conceptos integran la remuneración de un docente nombrado?",
      "¿Qué asignaciones y bonificaciones me corresponden?",
      "¿Cómo funciona la escala remunerativa magisterial?",
      "¿Qué es el incremento salarial y cómo se aplica?",
    ],
  },
  {
    codes: ["EVALUACION_DOCENTE"],
    keywords: ["EVALUACION DOCENTE"],
    starters: [
      "¿Cómo me inscribo en el Nombramiento Docente?",
      "¿Qué requisitos pide el Ascenso de Escala Magisterial?",
      "¿Cómo se evalúa el desempeño docente?",
      "¿Qué procesos de acceso a cargos directivos existen?",
    ],
  },
  {
    codes: ["SITUACIONES_ADMINISTRATIVAS"],
    keywords: ["SITUACIONES ADMINISTRATIVAS", "SITUACION ADMINISTRATIVA"],
    starters: [
      "¿Qué licencias puedo solicitar como docente?",
      "¿Qué requisitos tiene una licencia por salud?",
      "¿Qué permisos existen por capacitación?",
      "¿Cómo se tramita una sanción o un descargo?",
    ],
  },
  {
    codes: ["AUXILIAR_EDUCACION"],
    keywords: ["AUXILIAR DE EDUCACION", "AUXILIARES DE EDUCACION"],
    starters: [
      "¿Qué requisitos necesita un auxiliar de educación?",
      "¿Cómo se contrata a un auxiliar de educación?",
      "¿Qué funciones cumple un auxiliar de educación?",
      "¿Qué plazos rigen para su desplazamiento?",
    ],
  },
  {
    codes: ["CARGOS_PLAZAS"],
    keywords: ["CARGOS Y PLAZAS", "CARGO Y PLAZA"],
    starters: [
      "¿Cuál es la diferencia entre una plaza orgánica y una eventual?",
      "¿Cómo se elabora el cuadro de distribución de horas?",
      "¿Qué significa que mi plaza esté excedente?",
      "¿Quién decide las horas que se asignan a cada docente?",
    ],
  },
  {
    codes: ["LEY_REGLAMENTO"],
    keywords: ["LEY Y REGLAMENTO", "LEY DEL PROFESORADO"],
    starters: [
      "¿Qué norma regula la carrera docente?",
      "¿Qué derechos reconoce la ley a los docentes?",
      "¿Qué plazos establece la norma para un trámite?",
      "¿Qué ocurre si no se cumple la norma?",
    ],
  },
];

/** Último recurso: preguntas válidas para cualquier tema, con su nombre. */
function fallbackStarters(topicName: string): readonly string[] {
  return [
    `¿Qué requisitos necesito para un trámite de ${topicName}?`,
    `¿Qué plazos tengo para un trámite de ${topicName}?`,
    `¿Qué funciones o alcances tiene ${topicName}?`,
    `¿Qué pasa si mi caso no está previsto en ${topicName}?`,
  ];
}

/** Preguntas de ejemplo del tema; sin tema devuelve una lista vacía. */
export function moduleStartersFor(
  topic: StarterTopic | null | undefined,
): readonly string[] {
  const name = (topic?.name ?? "").trim();
  if (!name) return [];

  const code = normalize(topic?.code);
  const normalizedName = normalize(name);

  for (const group of STARTER_GROUPS) {
    if (group.codes.includes(code)) return group.starters;
    if (group.keywords.some((keyword) => normalizedName.includes(keyword))) {
      return group.starters;
    }
  }

  return fallbackStarters(name);
}
