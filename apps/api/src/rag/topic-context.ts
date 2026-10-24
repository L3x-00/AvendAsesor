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
}
