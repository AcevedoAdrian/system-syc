import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/main.ts", "src/seed.ts"],
  format: "esm",
  platform: "node",
  target: "node22",
  sourcemap: true,
  clean: true,
});
