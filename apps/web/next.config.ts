import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit and fontkit read data files from disk at runtime, so they are kept
  // external to the Server Component bundle. The orientation fonts are vendored
  // in-app (src/lib/orientation-document/fonts) and referenced with static
  // `new URL(..., import.meta.url)`, so the bundler traces and ships them as
  // assets without any extra file-tracing configuration.
  serverExternalPackages: ["fontkit", "pdfkit"],
};

export default nextConfig;
