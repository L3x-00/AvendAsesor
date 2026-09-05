import type {
  ModuleParentOption,
  ModuleView,
} from "@/components/admin/modules-explorer";
import type { ManagedModuleSummary } from "./types";

function byOrderThenName(
  a: ManagedModuleSummary,
  b: ManagedModuleSummary,
): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es");
}

/** Modules that are not logically deleted (still manageable). */
export function visibleModules(
  modules: ManagedModuleSummary[],
): ManagedModuleSummary[] {
  return modules.filter((module) => !module.isDeleted);
}

export function countSubmodules(
  modules: ManagedModuleSummary[],
  moduleId: string,
): number {
  return modules.filter(
    (module) => !module.isDeleted && module.parentModuleId === moduleId,
  ).length;
}

export function toModuleView(
  module: ManagedModuleSummary,
): ModuleView {
  return {
    code: module.code,
    description: module.description,
    documentCount: module.documentCount,
    id: module.id,
    isActive: module.isActive,
    name: module.name,
    parentModuleId: module.parentModuleId,
    sortOrder: module.sortOrder,
    submoduleCount: module.submoduleCount,
  };
}

/** Top-level modules (no parent), ordered, with submodule counts. */
export function rootModuleViews(
  allModules: ManagedModuleSummary[],
): ModuleView[] {
  return visibleModules(allModules)
    .filter((module) => !module.parentModuleId)
    .sort(byOrderThenName)
    .map(toModuleView);
}

/** Direct children of a module, ordered, with their own submodule counts. */
export function childModuleViews(
  allModules: ManagedModuleSummary[],
  parentId: string,
): ModuleView[] {
  return visibleModules(allModules)
    .filter((module) => module.parentModuleId === parentId)
    .sort(byOrderThenName)
    .map(toModuleView);
}

/** Options for the "parent module" selects. */
export function parentOptions(
  allModules: ManagedModuleSummary[],
): ModuleParentOption[] {
  return visibleModules(allModules)
    .filter((module) => !module.parentModuleId)
    .sort(byOrderThenName)
    .map((module) => ({
      code: module.code,
      id: module.id,
      name: module.name,
    }));
}

export function findVisibleModule(
  allModules: ManagedModuleSummary[],
  moduleId: string,
): ManagedModuleSummary | undefined {
  return visibleModules(allModules).find((module) => module.id === moduleId);
}
