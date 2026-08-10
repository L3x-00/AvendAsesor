import { z } from 'zod';

export const userRoles = ['superadmin', 'admin', 'docente'] as const;

export const userRoleSchema = z.enum(userRoles);

export type UserRole = z.infer<typeof userRoleSchema>;

export interface UserProfile {
  fullName: string;
  id: string;
  role: UserRole;
}

export const supabaseProfileRowSchema = z.object({
  full_name: z.string().trim().min(2).max(160),
  id: z.uuid(),
  role: userRoleSchema,
});
