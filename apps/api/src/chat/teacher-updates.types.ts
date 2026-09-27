/**
 * Novedades para el docente: consultas suyas que quedaron sin sustento y que
 * la administración marcó como resueltas al cargar el documento que faltaba
 * (las descartadas no generan aviso).
 * Así el docente sabe que puede volver a preguntar.
 */
export interface ResolvedConsultation {
  conversationId: string;
  /** La consulta tal como la escribió (para volver a enviarla). */
  question: string | null;
  resolvedAt: string;
}

export interface TeacherUpdatesGateway {
  listResolvedConsultations(input: {
    since: string;
    userId: string;
  }): Promise<ResolvedConsultation[]>;
}

export const TEACHER_UPDATES_WINDOW_DAYS = 30;
