import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const textSourceExtensions = new Set([".css", ".ts", ".tsx"]);
const mojibakePattern =
  /\u00c2[\u0080-\u00bf]|\u00c3[\u0080-\u00bf]|\u00e2\u20ac/u;

function listTextSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) return listTextSources(path);
    return textSourceExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

describe("source encoding", () => {
  it("keeps interface copy in real UTF-8 instead of double-encoded text", () => {
    const repositoryRoot = join(process.cwd(), "..", "..");
    const sourceRoots = [
      join(repositoryRoot, "apps", "api", "src"),
      join(repositoryRoot, "apps", "web", "src"),
    ];
    const offenders = sourceRoots.flatMap((sourceRoot) =>
      listTextSources(sourceRoot)
        .filter((path) => mojibakePattern.test(readFileSync(path, "utf8")))
        .map((path) => relative(repositoryRoot, path)),
    );

    expect(offenders).toEqual([]);
  });
});
