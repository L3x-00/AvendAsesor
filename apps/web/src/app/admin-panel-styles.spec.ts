import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const globalStyles = readFileSync(
  resolve(process.cwd(), "src/app/globals.css"),
  "utf8",
);

function relativeLuminance(hex: string): number {
  const channels = hex
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );

  if (!channels || channels.length !== 3) {
    throw new Error("Invalid RGB color.");
  }

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

describe("administrative panel visual contracts", () => {
  it("keeps the responsive mobile menu and touch targets", () => {
    expect(globalStyles).toMatch(
      /\.avend-admin-mobile-menu summary\s*\{[^}]*min-height:\s*2\.875rem/,
    );
    expect(globalStyles).toMatch(
      /\.avend-admin-mobile-menu\[open\] \.avend-admin-mobile-panel\s*\{[^}]*overflow-y:\s*auto/,
    );
    expect(globalStyles).toMatch(
      /\.avend-admin-navigation-link\s*\{[^}]*min-height:\s*2\.875rem/,
    );
  });

  it("keeps every administrative menu icon at one consistent size", () => {
    expect(globalStyles).toMatch(
      /\.avend-admin-navigation-icon\s*\{[^}]*height:\s*1\.35rem[^}]*width:\s*1\.35rem/,
    );
  });

  it("keeps the desktop sidebar layout and hides the mobile control", () => {
    expect(globalStyles).toMatch(
      /@media\s*\(min-width:\s*48rem\)[\s\S]*?\.avend-admin-shell\s*\{[^}]*grid-template-columns:\s*18\.75rem minmax\(0,\s*1fr\)/,
    );
    expect(globalStyles).toMatch(
      /@media\s*\(min-width:\s*48rem\)[\s\S]*?\.avend-admin-sidebar\s*\{[^}]*height:\s*100dvh[^}]*position:\s*sticky/,
    );
    expect(globalStyles).toMatch(
      /@media\s*\(min-width:\s*48rem\)[\s\S]*?\.avend-admin-mobile-bar\s*\{[^}]*display:\s*none/,
    );
  });

  it("keeps the outlined sign-out action readable on both surfaces", () => {
    const danger = globalStyles.match(
      /--avend-danger:\s*#([0-9a-f]{6})/i,
    )?.[1];
    const dangerOnDark = globalStyles.match(
      /--avend-danger-on-dark:\s*#([0-9a-f]{6})/i,
    )?.[1];
    const navy = globalStyles.match(/--avend-navy:\s*#([0-9a-f]{6})/i)?.[1];

    expect(danger).toBeDefined();
    expect(dangerOnDark).toBeDefined();
    expect(navy).toBeDefined();
    expect(contrastRatio(danger as string, "ffffff")).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrastRatio(dangerOnDark as string, navy as string),
    ).toBeGreaterThanOrEqual(4.5);
    expect(globalStyles).toMatch(
      /\.avend-admin-sign-out-button\s*\{[^}]*border:\s*1px solid var\(--avend-danger\)[^}]*color:\s*var\(--avend-danger\)/,
    );
    expect(globalStyles).toMatch(
      /\.avend-admin-sidebar \.avend-admin-sign-out-button\s*\{[^}]*border-color:\s*var\(--avend-danger-on-dark\)[^}]*color:\s*var\(--avend-danger-on-dark\)/,
    );
  });
});
