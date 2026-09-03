import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(
  resolve(process.cwd(), "src/components/admin/admin-dashboard.module.css"),
  "utf8",
);
const globalStyles = readFileSync(
  resolve(process.cwd(), "src/app/globals.css"),
  "utf8",
);

describe("administrative home visual contracts", () => {
  it("keeps the four user states visually distinct", () => {
    expect(styles).toMatch(
      /\.metricCardRegistered\s*\{[^}]*background:\s*var\(--avend-soft-blue\)/,
    );
    expect(styles).toMatch(
      /\.metricCardActive\s*\{[^}]*background:\s*#ecfdf3[^}]*border-left-color:\s*#039855/,
    );
    expect(styles).toMatch(
      /\.metricCardExpiring\s*\{[^}]*background:\s*#fff8eb[^}]*border-left-color:\s*#dc6803/,
    );
    expect(styles).toMatch(
      /\.metricCardExpired\s*\{[^}]*background:\s*#fff1f0[^}]*border-left-color:\s*#d92d20/,
    );
  });

  it("keeps the requested hierarchy and readable secondary text", () => {
    expect(styles).toMatch(/\.sectionTitle\s*\{[^}]*font-size:\s*1\.125rem/);
    expect(styles).toMatch(/\.metricValue\s*\{[^}]*font-size:\s*2rem/);
    expect(styles).toMatch(/\.metricHint\s*\{[^}]*font-size:\s*1rem/);
  });

  it("adapts card grids across phone, tablet and desktop", () => {
    expect(styles).toMatch(
      /@media\s*\(min-width:\s*32rem\)[\s\S]*?grid-template-columns:\s*repeat\(2,/,
    );
    expect(styles).toMatch(
      /@media\s*\(min-width:\s*72rem\)[\s\S]*?\.userMetricsGrid\s*\{[^}]*repeat\(4,/,
    );
    expect(styles).toMatch(
      /@media\s*\(min-width:\s*72rem\)[\s\S]*?\.generalMetricsGrid,[\s\S]*?repeat\(5,/,
    );
    expect(styles).toMatch(
      /\.quickCard,[\s\S]*?\.moduleCard\s*\{[^}]*min-height:\s*7\.5rem/,
    );
    expect(globalStyles).toMatch(
      /@media \(min-width: 48rem\) and \(max-width: 63\.999rem\)[\s\S]*?\.avend-admin-shell--home\s*\{[^}]*display:\s*block/,
    );
  });
});
