import { z } from 'zod';

export const userRoles = ['superadmin', 'admin', 'docente'] as const;

export const accountStatuses = ['active', 'suspended'] as const;

export const userRoleSchema = z.enum(userRoles);

export type UserRole = z.infer<typeof userRoleSchema>;

export const accountStatusSchema = z.enum(accountStatuses);

export type AccountStatus = z.infer<typeof accountStatusSchema>;

export interface UserProfile {
  accessExpiresAt: string | null;
  accountStatus: AccountStatus;
  fullName: string;
  id: string;
  role: UserRole;
}

const timestampSchema = z
  .string()
  .refine(
    (value) => !Number.isNaN(Date.parse(value)),
    'Expected an ISO-compatible timestamp.',
  );

export const supabaseProfileRowSchema = z.object({
  access_expires_at: timestampSchema.nullable(),
  account_status: accountStatusSchema,
  full_name: z.string().trim().min(2).max(160),
  id: z.uuid(),
  role: userRoleSchema,
});
