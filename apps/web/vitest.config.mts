import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./src/test/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    coverage: {
      exclude: [
        "src/app/**",
        "src/lib/supabase/**",
        "src/proxy.ts",
        "src/test/**",
      ],
      include: [
        "src/components/**/*.tsx",
        "src/lib/admin-api/**/*.ts",
        "src/lib/chat-api/**/*.ts",
        "src/lib/orientation-document/**/*.ts",
        "src/lib/auth/**/*.ts",
        "src/lib/authorization/**/*.ts",
        "src/components/chat/**/*.tsx",
      ],
      provider: "v8",
      thresholds: {
        "src/components/chat/chat-panel.tsx": {
          branches: 80,
          functions: 90,
          lines: 90,
          statements: 90,
        },
        "src/components/chat/chat-sources.tsx": {
          branches: 80,
          functions: 90,
          lines: 90,
          statements: 90,
        },
        "src/components/teacher/teacher-shell.tsx": {
          branches: 80,
          functions: 90,
          lines: 90,
          statements: 90,
        },
        branches: 80,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
    environment: "jsdom",
    include: ["src/**/*.spec.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
