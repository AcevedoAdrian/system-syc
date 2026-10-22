import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/main.ts", "src/seed.ts"],
  format: "esm",
  platform: "node",
  target: "node24",
  sourcemap: true,
  clean: true,
});
