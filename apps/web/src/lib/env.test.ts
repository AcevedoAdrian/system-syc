import { describe, expect, it, vi } from "vitest";

// `env.ts` valida `import.meta.env` al importarse: la variable tiene que estar antes del import.
vi.hoisted(() => {
  vi.stubEnv("VITE_API_URL", "/api");
});

import { env, resolveApiUrl } from "./env";

describe("resolveApiUrl", () => {
  it("resuelve una ruta contra el origen de la página", () => {
    expect(resolveApiUrl("/api", "http://10.0.0.5")).toBe("http://10.0.0.5/api");
  });

  it("deja igual una URL absoluta", () => {
    expect(resolveApiUrl("http://localhost:3000", "http://10.0.0.5")).toBe("http://localhost:3000");
  });

  it("rechaza una ruta sin barra inicial o que apunta a otro origen", () => {
    expect(resolveApiUrl("api", "http://10.0.0.5")).toBeNull();
    expect(resolveApiUrl("//otro-host/api", "http://10.0.0.5")).toBeNull();
    expect(resolveApiUrl("", "http://10.0.0.5")).toBeNull();
  });
});

describe("env", () => {
  it("expone VITE_API_URL ya resuelta contra el origen de la página", () => {
    expect(env.VITE_API_URL).toBe(`${window.location.origin}/api`);
  });
});
