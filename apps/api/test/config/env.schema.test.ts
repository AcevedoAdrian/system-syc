import { describe, expect, it } from "vitest";
import { loadEnv } from "@/config/env.schema";

const DEV_SECRET = "dev-only-secret-change-me-0123456789abcdef";
const REAL_SECRET = "kq7Zp3VxN2mT9wRb5LcY8hJd4FgS6aEu";

const raw = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/syc",
  WEB_ORIGIN: "http://localhost",
  BETTER_AUTH_SECRET: REAL_SECRET,
  BETTER_AUTH_URL: "http://localhost",
  ...extra,
});

describe("loadEnv", () => {
  it("en producción acepta un secreto propio", () => {
    expect(loadEnv(raw()).BETTER_AUTH_SECRET).toBe(REAL_SECRET);
  });

  it("en producción rechaza el secreto de ejemplo, nombrando la variable", () => {
    expect(() => loadEnv(raw({ BETTER_AUTH_SECRET: DEV_SECRET }))).toThrow(
      /BETTER_AUTH_SECRET: es el secreto de ejemplo/,
    );
  });

  it("en producción rechaza también una variante del secreto de ejemplo", () => {
    expect(() =>
      loadEnv(raw({ BETTER_AUTH_SECRET: "dev-only-otro-secreto-copiado-0123456789" })),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it.each(["development", "test"])("en %s sigue aceptando el secreto de ejemplo", (nodeEnv) => {
    expect(loadEnv(raw({ NODE_ENV: nodeEnv, BETTER_AUTH_SECRET: DEV_SECRET }))).toMatchObject({
      NODE_ENV: nodeEnv,
    });
  });

  it("sigue exigiendo 32 caracteres como mínimo", () => {
    expect(() => loadEnv(raw({ BETTER_AUTH_SECRET: "corto" }))).toThrow(/BETTER_AUTH_SECRET/);
  });
});
