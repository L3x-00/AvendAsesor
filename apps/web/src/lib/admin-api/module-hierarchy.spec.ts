import { describe, expect, it } from "vitest";
import {
  childModuleViews,
  countSubmodules,
  findVisibleModule,
  parentOptions,
  rootModuleViews,
  visibleModules,
} from "./module-hierarchy";
import type { ManagedModule } from "./types";

function mod(
  overrides: Partial<ManagedModule> & Pick<ManagedModule, "id">,
): ManagedModule {
  return {
    code: "CODE",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: null,
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
    deletedAt: null,
    deletedBy: null,
    deletionReason: null,
    description: null,
    isActive: true,
    isDeleted: false,
    metadata: {},
    name: "Módulo",
    parentModuleId: null,
    sortOrder: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    updatedBy: null,
    ...overrides,
  };
}

const modules: ManagedModule[] = [
  mod({ code: "BETA", id: "root-b", name: "Beta", sortOrder: 2 }),
  mod({ code: "ALFA", id: "root-a", name: "Alfa", sortOrder: 1 }),
  mod({ code: "SUB1", id: "sub-1", name: "Sub Uno", parentModuleId: "root-a", sortOrder: 2 }),
  mod({ code: "SUB2", id: "sub-2", name: "Sub Dos", parentModuleId: "root-a", sortOrder: 1 }),
  mod({ code: "DEL", id: "deleted", isDeleted: true, name: "Borrado" }),
];

describe("module-hierarchy", () => {
  it("lists root modules ordered by sortOrder with submodule counts and excludes deleted", () => {
    const roots = rootModuleViews(modules);

    expect(roots.map((view) => view.id)).toEqual(["root-a", "root-b"]);
    expect(roots.find((view) => view.id === "root-a")?.submoduleCount).toBe(2);
    expect(roots.find((view) => view.id === "root-b")?.submoduleCount).toBe(0);
    expect(roots.some((view) => view.id === "deleted")).toBe(false);
  });

  it("lists direct children ordered by sortOrder", () => {
    expect(childModuleViews(modules, "root-a").map((view) => view.id)).toEqual([
      "sub-2",
      "sub-1",
    ]);
  });

  it("counts only non-deleted submodules", () => {
    expect(countSubmodules(modules, "root-a")).toBe(2);
    expect(countSubmodules(modules, "root-b")).toBe(0);
  });

  it("offers every non-deleted module as a parent option", () => {
    const options = parentOptions(modules);

    expect(options).toHaveLength(4);
    expect(options.some((option) => option.id === "deleted")).toBe(false);
  });

  it("finds a visible module and ignores deleted ids", () => {
    expect(findVisibleModule(modules, "root-a")?.id).toBe("root-a");
    expect(findVisibleModule(modules, "deleted")).toBeUndefined();
    expect(findVisibleModule(modules, "missing")).toBeUndefined();
  });

  it("excludes logically deleted modules from the visible set", () => {
    expect(visibleModules(modules)).toHaveLength(4);
  });
});
