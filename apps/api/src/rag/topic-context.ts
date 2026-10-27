/**
 * Orientación preparada al seleccionar un tema. No forma parte de la evidencia
 * recuperada: solo ayuda al modelo a reconocer el alcance de la consulta.
 */
export interface InternalTopicContext {
  documents: Array<{
    summary: string | null;
    title: string;
  }>;
  moduleId: string;
  scopeName: string;
  /**
   * Resúmenes internos agregados del tema raíz y de sus subtemas directos.
   * Orientan el reconocimiento del asunto; nunca son evidencia ni se citan.
   */
  topicSummaries?: Array<{
    summary: string | null;
    topicName: string;
  }>;
}
