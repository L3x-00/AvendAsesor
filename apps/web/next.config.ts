import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// The orientation document builders read font assets and PDFKit's metric data
// from node_modules at runtime (via fs, not a static import), so Next's file
// tracing cannot detect them. Declare them explicitly for the two routes that
// load the builders, relative to the monorepo root, so a serverless/standalone
// deployment ships them. Only the exact faces used are listed to avoid bundling
// the full @fontsource catalog.
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const orientationDocumentAssets = [
  "node_modules/@fontsource/noto-emoji/files/noto-emoji-emoji-400-normal.woff",
  "node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff",
  "node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-italic.woff",
  "node_modules/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff",
  "node_modules/@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff",
  "node_modules/@fontsource/noto-sans/files/noto-sans-latin-ext-400-italic.woff",
  "node_modules/@fontsource/noto-sans/files/noto-sans-latin-ext-700-normal.woff",
  "node_modules/pdfkit/js/data/*.afm",
];

const orientationDocumentRoutes = [
  "/api/chat/conversations/[conversationId]/messages/[messageId]/orientacion/[format]",
  "/chat/[conversationId]/orientacion/[messageId]",
];

const nextConfig: NextConfig = {
  // PDFKit/fontkit and the font packages read server-only assets at runtime, so
  // they are kept external to the bundle.
  serverExternalPackages: [
    "@fontsource/noto-emoji",
    "@fontsource/noto-sans",
    "fontkit",
    "pdfkit",
  ],
  outputFileTracingRoot: workspaceRoot,
  outputFileTracingIncludes: Object.fromEntries(
    orientationDocumentRoutes.map((route) => [route, orientationDocumentAssets]),
  ),
};

export default nextConfig;
