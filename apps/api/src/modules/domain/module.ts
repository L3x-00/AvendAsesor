import { z } from 'zod';

export type ModuleActivityFilter = 'active' | 'all' | 'inactive';

export type ModuleMetadata = Record<string, unknown>;

export interface ManagedModule {
  code: string;
  createdAt: string;
  createdBy: string | null;
  deactivatedAt: string | null;
  deactivatedBy: string | null;
  deactivationReason: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  deletionReason: string | null;
  description: string | null;
  id: string;
  isActive: boolean;
  isDeleted: boolean;
  metadata: ModuleMetadata;
  name: string;
  parentModuleId: string | null;
  sortOrder: number;
  updatedAt: string;
  updatedBy: string | null;
}

const moduleMetadataSchema = z
  .record(z.string(), z.unknown())
  .transform((metadata) => metadata as ModuleMetadata);

const timestampSchema = z
  .string()
  .refine(
    (value) => !Number.isNaN(Date.parse(value)),
    'Expected an ISO-compatible timestamp.',
  );

export const managedModuleSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
  created_at: timestampSchema,
  created_by: z.string().uuid().nullable(),
  deactivated_at: timestampSchema.nullable(),
  deactivated_by: z.string().uuid().nullable(),
  deactivation_reason: z.string().nullable(),
  deleted_at: timestampSchema.nullable(),
  deleted_by: z.string().uuid().nullable(),
  deletion_reason: z.string().nullable(),
  description: z.string().nullable(),
  id: z.string().uuid(),
  is_active: z.boolean(),
  is_deleted: z.boolean(),
  metadata: moduleMetadataSchema,
  name: z.string(),
  parent_module_id: z.string().uuid().nullable(),
  sort_order: z.number().int().nonnegative(),
  updated_at: timestampSchema,
  updated_by: z.string().uuid().nullable(),
});

export function toManagedModule(value: unknown): ManagedModule {
  const result = managedModuleSchema.safeParse(value);

  if (!result.success) {
    throw new Error('Module data returned by the store is invalid.');
  }

  return {
    code: result.data.code,
    createdAt: result.data.created_at,
    createdBy: result.data.created_by,
    deactivatedAt: result.data.deactivated_at,
    deactivatedBy: result.data.deactivated_by,
    deactivationReason: result.data.deactivation_reason,
    deletedAt: result.data.deleted_at,
    deletedBy: result.data.deleted_by,
    deletionReason: result.data.deletion_reason,
    description: result.data.description,
    id: result.data.id,
    isActive: result.data.is_active,
    isDeleted: result.data.is_deleted,
    metadata: result.data.metadata,
    name: result.data.name,
    parentModuleId: result.data.parent_module_id,
    sortOrder: result.data.sort_order,
    updatedAt: result.data.updated_at,
    updatedBy: result.data.updated_by,
  };
}
