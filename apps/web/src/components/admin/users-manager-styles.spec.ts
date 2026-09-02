import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = process.cwd();
const globalStyles = readFileSync(
  resolve(webRoot, "src/app/globals.css"),
  "utf8",
);
const usersManagerStyles = readFileSync(
  resolve(webRoot, "src/components/admin/users-manager.module.css"),
  "utf8",
);

function relativeLuminance(hex: string): number {
  const channels = hex
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  if (!channels || channels.length !== 3) throw new Error("Invalid RGB color.");
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

describe("superadministrator user directory visual contracts", () => {
  it("keeps the search action above WCAG AA contrast", () => {
    const strongAccent = globalStyles.match(
      /--avend-accent-strong:\s*#([0-9a-f]{6})/i,
    )?.[1];

    expect(strongAccent).toBeDefined();
    expect(
      contrastRatio("ffffff", strongAccent as string),
    ).toBeGreaterThanOrEqual(4.5);
    expect(usersManagerStyles).toMatch(
      /\.searchButton\s*\{[^}]*background:\s*var\(--avend-accent-strong\)/,
    );
    expect(usersManagerStyles).toMatch(
      /\.searchButton:hover\s*\{[^}]*background:\s*var\(--avend-navy\)/,
    );
  });
});
