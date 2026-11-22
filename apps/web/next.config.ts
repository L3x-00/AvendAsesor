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
  experimental: {
    // Reutiliza en el navegador el segmento ya renderizado de una página
    // dinámica durante 30 s. Sin esto, volver a una pestaña del panel cuesta
    // exactamente lo mismo que abrirla por primera vez: el servidor vuelve a
    // ejecutar autorización y consultas.
    //
    // Es seguro porque cada mutación invalida con `revalidatePath` las rutas
    // cuyos datos cambia (ver `src/app/admin/actions.invalidation.spec.ts`), y
    // esa invalidación también descarta la entrada del cache de cliente.
    // Consecuencia asumida: un dato modificado desde otro dispositivo puede
    // tardar hasta 30 s en verse aquí.
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
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
