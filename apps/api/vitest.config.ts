import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // `@` apunta a `src` solo para los tests; el código de producción usa rutas relativas.
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["reflect-metadata"],
  },
});
