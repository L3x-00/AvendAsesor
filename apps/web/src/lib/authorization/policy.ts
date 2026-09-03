import { z } from "zod";

export const administrativeRoles = ["admin", "superadmin"] as const;
export const chatRoles = ["docente", "admin", "superadmin"] as const;
export const activeAccountStatus = "active";

export const administrativeRoleSchema = z.enum(administrativeRoles);

export type AdministrativeRole = z.infer<typeof administrativeRoleSchema>;
export const chatRoleSchema = z.enum(chatRoles);
export type ChatRole = z.infer<typeof chatRoleSchema>;

export function isAdministrativeRole(
  role: unknown,
): role is AdministrativeRole {
  return administrativeRoleSchema.safeParse(role).success;
}

export function isChatRole(role: unknown): role is ChatRole {
  return chatRoleSchema.safeParse(role).success;
}

export function isActiveAccountStatus(status: unknown): boolean {
  return status === activeAccountStatus;
}

export function hasCurrentAccess(
  accessExpiresAt: unknown,
  now = Date.now(),
): boolean {
  if (accessExpiresAt === null) return true;
  if (typeof accessExpiresAt !== "string") return false;

  const expiry = Date.parse(accessExpiresAt);
  return Number.isFinite(expiry) && expiry >= now;
}
