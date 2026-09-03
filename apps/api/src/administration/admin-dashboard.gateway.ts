export const ADMIN_HOME_EXPIRY_WINDOW_DAYS = 7;

export const ADMIN_HOME_MODULE_NAMES = [
  'Contratación y desplazamientos',
  'Evaluación docente',
  'Situaciones administrativas',
  'Auxiliar de educación',
  'Ley y reglamento',
  'Cargos y plazas',
  'Remuneraciones',
] as const;

export type AdminHomeModuleName = (typeof ADMIN_HOME_MODULE_NAMES)[number];

export interface AdminHomeModuleSummary {
  documentCount: number;
  id: string;
  name: AdminHomeModuleName;
  submoduleCount: number;
}

export interface AdminHomeDashboard {
  activeModules: number;
  activeSubmodules: number;
  activeUsers: number;
  aiQueriesProcessed: number;
  expiredUsers: number;
  expiringSoonUsers: number;
  expiryWindowDays: number;
  moduleSummaries: AdminHomeModuleSummary[];
  totalDocuments: number;
  totalQueries: number;
  totalUsers: number;
}

export interface AdminDashboardGateway {
  getDashboard(input: {
    administratorId: string;
    expiringSoonDays: number;
  }): Promise<AdminHomeDashboard>;
}
