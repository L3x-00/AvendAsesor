import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDFKit reads its bundled font metrics at runtime. Keeping it external to
  // the Server Component bundle preserves those server-only assets.
  serverExternalPackages: [
    "@fontsource/noto-emoji",
    "@fontsource/noto-sans",
    "fontkit",
    "pdfkit",
  ],
};

export default nextConfig;
