import { defineConfig } from "vitest/config";
import path from "path";

const alias = {
  "@": path.resolve(__dirname, "src"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: [
            "tests/unit/**/*.test.ts",
            "src/**/__tests__/**/*.test.ts",
          ],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration-db",
          include: ["tests/integration/db/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/integration/db/setup.ts"],
          // DB truncation and pg-boss mutate shared state; keep these serial.
          fileParallelism: false,
        },
      },
    ],
  },
});
