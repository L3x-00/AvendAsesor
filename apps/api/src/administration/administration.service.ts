import { Inject, Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../authorization';
import { SUPABASE_ADMIN_DASHBOARD_GATEWAY } from '../supabase/supabase.constants';
import {
  ADMIN_HOME_EXPIRY_WINDOW_DAYS,
  type AdminDashboardGateway,
  type AdminHomeDashboard,
} from './admin-dashboard.gateway';

@Injectable()
export class AdministrationService {
  constructor(
    @Inject(SUPABASE_ADMIN_DASHBOARD_GATEWAY)
    private readonly dashboardGateway: AdminDashboardGateway,
  ) {}

  getDashboard(
    authorization: AuthorizationContext,
  ): Promise<AdminHomeDashboard> {
    return this.dashboardGateway.getDashboard({
      administratorId: authorization.userId,
      expiringSoonDays: ADMIN_HOME_EXPIRY_WINDOW_DAYS,
    });
  }
}
