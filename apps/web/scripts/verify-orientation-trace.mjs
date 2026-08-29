import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const tracePath = path.join(
  webRoot,
  ".next",
  "server",
  "app",
  "api",
  "chat",
  "conversations",
  "[conversationId]",
  "messages",
  "[messageId]",
  "orientacion",
  "[format]",
  "route.js.nft.json",
);

const trace = JSON.parse(await readFile(tracePath, "utf8"));
if (!Array.isArray(trace.files)) {
  throw new Error("The CU-14 route trace does not contain a file list.");
}

const files = trace.files.map((file) => String(file).replaceAll("\\", "/"));
const requiredRuntimeEntries = [
  "node_modules/@noble/ciphers/aes.js",
  "node_modules/@noble/hashes/utils.js",
  "node_modules/@swc/helpers/cjs/_define_property.cjs",
  "node_modules/fflate/lib/node.cjs",
  "node_modules/fontkit/dist/main.cjs",
  "node_modules/linebreak/dist/main.cjs",
  "node_modules/pdfkit/js/pdfkit.node.mjs",
  "node_modules/restructure/dist/main.cjs",
  "node_modules/unicode-properties/dist/main.cjs",
];
const missingEntries = requiredRuntimeEntries.filter(
  (entry) => !files.some((file) => file.endsWith(entry)),
);

const expectedFonts = [
  "noto-emoji-emoji-400-normal",
  "noto-sans-latin-400-italic",
  "noto-sans-latin-400-normal",
  "noto-sans-latin-700-normal",
  "noto-sans-latin-ext-400-italic",
  "noto-sans-latin-ext-400-normal",
  "noto-sans-latin-ext-700-normal",
];
const missingFonts = expectedFonts.filter(
  (font) => !files.some((file) => file.includes(font) && file.endsWith(".woff")),
);

if (missingEntries.length || missingFonts.length) {
  throw new Error(
    [
      "The CU-14 serverless trace is incomplete.",
      missingEntries.length
        ? `Missing runtime entries: ${missingEntries.join(", ")}`
        : null,
      missingFonts.length ? `Missing fonts: ${missingFonts.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

console.log(
  `ORIENTATION_TRACE=PASS runtime_entries=${requiredRuntimeEntries.length} fonts=${expectedFonts.length}`,
);
