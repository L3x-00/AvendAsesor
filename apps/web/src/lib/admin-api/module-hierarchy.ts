import type {
  ModuleParentOption,
  ModuleView,
} from "@/components/admin/modules-explorer";
import type { ManagedModule } from "./types";

function byOrderThenName(a: ManagedModule, b: ManagedModule): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es");
}

/** Modules that are not logically deleted (still manageable). */
export function visibleModules(modules: ManagedModule[]): ManagedModule[] {
  return modules.filter((module) => !module.isDeleted);
}

export function countSubmodules(
  modules: ManagedModule[],
  moduleId: string,
): number {
  return modules.filter(
    (module) => !module.isDeleted && module.parentModuleId === moduleId,
  ).length;
}

export function toModuleView(
  module: ManagedModule,
  allModules: ManagedModule[],
): ModuleView {
  return {
    code: module.code,
    description: module.description,
    id: module.id,
    isActive: module.isActive,
    name: module.name,
    parentModuleId: module.parentModuleId,
    sortOrder: module.sortOrder,
    submoduleCount: countSubmodules(allModules, module.id),
  };
}

/** Top-level modules (no parent), ordered, with submodule counts. */
export function rootModuleViews(allModules: ManagedModule[]): ModuleView[] {
  return visibleModules(allModules)
    .filter((module) => !module.parentModuleId)
    .sort(byOrderThenName)
    .map((module) => toModuleView(module, allModules));
}

/** Direct children of a module, ordered, with their own submodule counts. */
export function childModuleViews(
  allModules: ManagedModule[],
  parentId: string,
): ModuleView[] {
  return visibleModules(allModules)
    .filter((module) => module.parentModuleId === parentId)
    .sort(byOrderThenName)
    .map((module) => toModuleView(module, allModules));
}

/** Options for the "parent module" selects. */
export function parentOptions(allModules: ManagedModule[]): ModuleParentOption[] {
  return visibleModules(allModules)
    .sort(byOrderThenName)
    .map((module) => ({
      code: module.code,
      id: module.id,
      name: module.name,
    }));
}

export function findVisibleModule(
  allModules: ManagedModule[],
  moduleId: string,
): ManagedModule | undefined {
  return visibleModules(allModules).find((module) => module.id === moduleId);
}
