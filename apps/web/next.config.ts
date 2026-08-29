import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

const orientationRuntimePackages = [
  "../../node_modules/@noble/ciphers/**/*",
  "../../node_modules/@noble/hashes/**/*",
  "../../node_modules/@swc/helpers/**/*",
  "../../node_modules/base64-js/**/*",
  "../../node_modules/brotli/**/*",
  "../../node_modules/clone/**/*",
  "../../node_modules/dfa/**/*",
  "../../node_modules/fast-deep-equal/**/*",
  "../../node_modules/fflate/**/*",
  "../../node_modules/fontkit/**/*",
  "../../node_modules/linebreak/**/*",
  "../../node_modules/pako/**/*",
  "../../node_modules/pdfkit/**/*",
  "../../node_modules/png-js/**/*",
  "../../node_modules/restructure/**/*",
  "../../node_modules/tiny-inflate/**/*",
  "../../node_modules/unicode-properties/**/*",
  "../../node_modules/unicode-trie/**/*",
] as const;

const nextConfig: NextConfig = {
  // Dependencies are hoisted to the monorepo root. The CU-14 function loads
  // CJS-only runtime entries that @vercel/nft cannot infer from package ESM
  // exports, so include the bounded pdfkit/fontkit closure for this route only.
  outputFileTracingIncludes: {
    "/api/chat/conversations/*/messages/*/orientacion/*": [
      ...orientationRuntimePackages,
    ],
  },
  outputFileTracingRoot: repositoryRoot,
  // Keep the Node implementations external to the Server Component bundle.
  // Vendored fonts use static new URL literals and remain traced as assets.
  serverExternalPackages: ["fontkit", "pdfkit"],
};

export default nextConfig;
