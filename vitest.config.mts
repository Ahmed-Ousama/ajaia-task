import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    env: loadEnv("test", process.cwd(), ""), // pick up DATABASE_URL etc. from .env
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
  },
});
