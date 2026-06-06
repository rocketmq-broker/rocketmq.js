import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["packages/*/src/**/*.test.ts", "packages/*/src/index.ts", "packages/cli/**"],
      thresholds: {
        statements: 99,
        branches: 97,
        functions: 100,
        lines: 99,
      },
    },
  },
});
