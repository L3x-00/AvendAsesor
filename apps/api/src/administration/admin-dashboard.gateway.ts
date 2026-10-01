export const ADMIN_HOME_EXPIRY_WINDOW_DAYS = 7;

/**
 * Tarjeta de un módulo raíz en Inicio. Sale de los módulos reales (no de una
 * lista fija): el superadministrador los crea, renombra y elimina desde el
 * panel, y una lista fija dejaba Inicio sin cargar en cuanto uno cambiaba.
 */
export interface AdminHomeModuleSummary {
  documentCount: number;
  id: string;
  isActive: boolean;
  name: string;
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
