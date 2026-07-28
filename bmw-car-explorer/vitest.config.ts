import { defineConfig } from "vitest/config";
import path from "node:path";

// Domain-focused test config. The /domain modules are pure and have no DOM,
// DB, or network dependency (AR-02), so the default node environment is used.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "domain/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // §10: ≥85% coverage on /domain.
      include: ["domain/**/*.ts"],
      exclude: ["domain/**/*.test.ts", "domain/types.ts"],
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 80,
      },
    },
  },
});
