import {
  ConflictException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';
import { toManagedModule, type ManagedModule } from '../modules/domain/module';
import type {
  CreateModuleRecord,
  ListModulesOptions,
  ManagedModuleSummary,
  ModulesGateway,
  UpdateModuleRecord,
} from '../modules/modules.gateway';
import type {
  Json,
  SupabaseDatabase,
  SupabaseServerClient,
} from './supabase.server-client';

const MODULE_COLUMNS =
  'id,parent_module_id,name,code,description,sort_order,metadata,is_active,deactivated_at,deactivated_by,deactivation_reason,is_deleted,deleted_at,deleted_by,deletion_reason,created_at,created_by,updated_at,updated_by';

type ModuleInsert = SupabaseDatabase['public']['Tables']['modules']['Insert'];
type ModuleUpdate = SupabaseDatabase['public']['Tables']['modules']['Update'];

function toJson(metadata: Record<string, unknown>): Json {
  return metadata as Json;
}

function databaseError(error: PostgrestError): never {
  if (error.code === '23505') {
    throw new ConflictException('A module with this code already exists.');
  }

  if (
    error.code === '23503' ||
    error.code === '23514' ||
    error.code === 'P0001'
  ) {
    throw new ConflictException('The requested module hierarchy is not valid.');
  }

  throw new ServiceUnavailableException(
    'The module store is temporarily unavailable.',
  );
}

export class SupabaseModulesGatewayAdapter implements ModulesGateway {
  constructor(private readonly client: SupabaseServerClient | null) {}

  async create(input: CreateModuleRecord): Promise<ManagedModule> {
    const client = this.requireClient();
    const record: ModuleInsert = {
      code: input.code,
      created_by: input.createdBy,
      description: input.description ?? null,
      is_active: input.isActive ?? true,
      metadata: input.metadata ? toJson(input.metadata) : undefined,
      name: input.name,
      parent_module_id: input.parentModuleId ?? null,
      sort_order: input.sortOrder,
      updated_by: input.updatedBy,
    };
    const { data, error } = await client
      .from('modules')
      .insert(record)
      .select(MODULE_COLUMNS)
      .single();

    if (error) {
      databaseError(error);
    }

    return this.parseRow(data);
  }

  async findById(moduleId: string): Promise<ManagedModule | null> {
    const client = this.requireClient();
    const { data, error } = await client
      .from('modules')
      .select(MODULE_COLUMNS)
      .eq('id', moduleId)
      .maybeSingle();

    if (error) {
      databaseError(error);
    }

    return data ? this.parseRow(data) : null;
  }

  async hasNonDeletedChildren(moduleId: string): Promise<boolean> {
    const client = this.requireClient();
    const { count, error } = await client
      .from('modules')
      .select('id', { count: 'exact', head: true })
      .eq('parent_module_id', moduleId)
      .eq('is_deleted', false);

    if (error) {
      databaseError(error);
    }

    return (count ?? 0) > 0;
  }

  async list(options: ListModulesOptions): Promise<ManagedModule[]> {
    const client = this.requireClient();
    let query = client
      .from('modules')
      .select(MODULE_COLUMNS)
      .eq('is_deleted', false);

    if (options.parentModuleId) {
      query = query.eq('parent_module_id', options.parentModuleId);
    }

    if (options.status !== 'all') {
      query = query.eq('is_active', options.status === 'active');
    }

    const { data, error } = await query
      .order('parent_module_id', { ascending: true, nullsFirst: true })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      databaseError(error);
    }

    return (data ?? []).map((row) => this.parseRow(row));
  }

  async listSummaries(
    options: Pick<ListModulesOptions, 'status'>,
  ): Promise<ManagedModuleSummary[]> {
    const { data, error } = await this.requireClient().rpc(
      'list_module_summaries',
      { p_status: options.status },
    );

    if (error) databaseError(error);

    return (data ?? []).map((row) => {
      const module = this.parseRow(row);
      const documentCount = Number(row.document_count);
      const submoduleCount = Number(row.submodule_count);

      if (
        !Number.isSafeInteger(documentCount) ||
        !Number.isSafeInteger(submoduleCount)
      ) {
        throw new InternalServerErrorException(
          'Module summary data is invalid.',
        );
      }

      return { ...module, documentCount, submoduleCount };
    });
  }

  async update(
    moduleId: string,
    input: UpdateModuleRecord,
  ): Promise<ManagedModule | null> {
    const client = this.requireClient();
    const record: ModuleUpdate = {
      code: input.code,
      deactivated_at: input.deactivatedAt,
      deactivated_by: input.deactivatedBy,
      deactivation_reason: input.deactivationReason,
      deleted_at: input.deletedAt,
      deleted_by: input.deletedBy,
      deletion_reason: input.deletionReason,
      description: input.description,
      is_active: input.isActive,
      is_deleted: input.isDeleted,
      metadata: input.metadata ? toJson(input.metadata) : undefined,
      name: input.name,
      parent_module_id: input.parentModuleId,
      sort_order: input.sortOrder,
      updated_by: input.updatedBy,
    };
    const { data, error } = await client
      .from('modules')
      .update(record)
      .eq('id', moduleId)
      .select(MODULE_COLUMNS)
      .maybeSingle();

    if (error) {
      databaseError(error);
    }

    return data ? this.parseRow(data) : null;
  }

  private parseRow(row: unknown): ManagedModule {
    try {
      return toManagedModule(row);
    } catch {
      throw new InternalServerErrorException('Module data is invalid.');
    }
  }

  private requireClient(): SupabaseServerClient {
    if (!this.client) {
      throw new ServiceUnavailableException('Module store is not configured.');
    }

    return this.client;
  }
}
