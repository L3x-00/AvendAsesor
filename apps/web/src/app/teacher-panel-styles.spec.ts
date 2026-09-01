import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = process.cwd();
const globalStyles = readFileSync(
  resolve(webRoot, "src/app/globals.css"),
  "utf8",
);
const polishStyles = readFileSync(
  resolve(webRoot, "src/app/ui-polish.css"),
  "utf8",
);
const sourceStyles = readFileSync(
  resolve(webRoot, "src/components/chat/chat-sources.module.css"),
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

describe("teacher panel visual contracts", () => {
  it.each([
    ".avend-chat-composer-buttons",
    ".avend-chat-error",
    ".avend-chat-input-shell",
    ".avend-chat-list",
    ".avend-chat-mic",
    ".avend-chat-mic-icon",
    ".avend-chat-paragraph",
    ".avend-chat-send-icon",
    ".avend-teacher-mobile-menu-icon",
    ".avend-teacher-sign-out",
  ])("keeps the base selector %s defined", (selector) => {
    const escapedSelector = selector.replace(".", "\\.");
    expect(`${globalStyles}\n${polishStyles}`).toMatch(
      new RegExp(`${escapedSelector}\\s*(?:,|\\{)`),
    );
  });

  it.each([".tableViewport", ".table", ".sourceLink", ".linkIcon"])(
    "keeps the reference selector %s defined",
    (selector) => {
      const escapedSelector = selector.replace(".", "\\.");
      expect(sourceStyles).toMatch(new RegExp(`${escapedSelector}\\s*\\{`));
    },
  );

  it("keeps white text on the strong accent above WCAG AA contrast", () => {
    const accent = globalStyles.match(
      /--avend-accent-strong:\s*#([0-9a-f]{6})/i,
    )?.[1];
    expect(accent).toBeDefined();
    expect(contrastRatio("ffffff", accent as string)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the critical responsive, touch and reduced-motion rules", () => {
    expect(globalStyles).toMatch(
      /\.avend-chat-mic\s*\{[^}]*min-height:\s*2\.875rem/,
    );
    expect(globalStyles).toMatch(
      /\.avend-teacher-new-chat\s*\{[^}]*min-height:\s*2\.875rem/,
    );
    expect(globalStyles).toMatch(
      /@media\s*\(min-width:\s*64rem\)[\s\S]*grid-template-columns:\s*16\.5rem minmax\(0,\s*1fr\)/,
    );
    expect(sourceStyles).toMatch(
      /\.tableViewport\s*\{[^}]*overflow-x:\s*auto/,
    );
    expect(sourceStyles).toMatch(
      /@media\s*\(max-width:\s*47\.999rem\)[\s\S]*\.table td,[\s\S]*?display:\s*grid/,
    );
    expect(polishStyles).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*animation:\s*none/,
    );
  });
});
