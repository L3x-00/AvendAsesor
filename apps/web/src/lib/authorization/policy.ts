import { z } from 'zod';

export const administrativeRoles = ['admin', 'superadmin'] as const;

export const administrativeRoleSchema = z.enum(administrativeRoles);

export type AdministrativeRole = z.infer<typeof administrativeRoleSchema>;

export function isAdministrativeRole(role: unknown): role is AdministrativeRole {
  return administrativeRoleSchema.safeParse(role).success;
}
