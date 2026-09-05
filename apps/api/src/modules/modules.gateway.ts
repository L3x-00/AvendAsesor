import type {
  ManagedModule,
  ModuleActivityFilter,
  ModuleMetadata,
} from './domain/module';

export interface ListModulesOptions {
  parentModuleId?: string;
  status: ModuleActivityFilter;
}

export interface CreateModuleRecord {
  code: string;
  createdBy: string;
  description?: string;
  isActive?: boolean;
  metadata?: ModuleMetadata;
  name: string;
  parentModuleId?: string | null;
  sortOrder?: number;
  updatedBy: string;
}

export interface UpdateModuleRecord {
  code?: string;
  deactivatedAt?: string | null;
  deactivatedBy?: string | null;
  deactivationReason?: string | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
  deletionReason?: string | null;
  description?: string | null;
  isActive?: boolean;
  isDeleted?: boolean;
  metadata?: ModuleMetadata;
  name?: string;
  parentModuleId?: string | null;
  sortOrder?: number;
  updatedBy: string;
}

export interface ModulesGateway {
  create(input: CreateModuleRecord): Promise<ManagedModule>;
  findById(moduleId: string): Promise<ManagedModule | null>;
  hasNonDeletedChildren(moduleId: string): Promise<boolean>;
  list(options: ListModulesOptions): Promise<ManagedModule[]>;
  listSummaries(
    options: Pick<ListModulesOptions, 'status'>,
  ): Promise<ManagedModuleSummary[]>;
  update(
    moduleId: string,
    input: UpdateModuleRecord,
  ): Promise<ManagedModule | null>;
}

export interface ManagedModuleSummary extends ManagedModule {
  documentCount: number;
  submoduleCount: number;
}
