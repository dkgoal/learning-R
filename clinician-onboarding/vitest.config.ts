import { defineConfig } from "vitest/config";
import path from "node:path";

// The /domain modules are pure: no DOM, no network, no clock reads except the
// `today` values callers pass in. That keeps the rule engines deterministic and
// testable, which §14 (auditability) effectively requires.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["domain/**/*.ts"],
      exclude: ["domain/types.ts"],
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 80,
      },
    },
  },
});
