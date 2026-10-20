import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTheme, initTheme, setTheme, subscribeTheme, THEME_STORAGE_KEY } from "@/lib/theme";

function mockSystemPrefersDark(dark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({ matches: dark && query.includes("dark") })),
  );
}

describe("tema", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sin elección ni preferencia del sistema, arranca en claro", () => {
    initTheme();

    expect(getTheme()).toBe("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("sin elección, sigue la preferencia del sistema", () => {
    mockSystemPrefersDark(true);

    initTheme();

    expect(getTheme()).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("la elección guardada gana sobre la preferencia del sistema", () => {
    mockSystemPrefersDark(true);
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    initTheme();

    expect(getTheme()).toBe("light");
  });

  it("restaura el oscuro guardado", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");

    initTheme();

    expect(getTheme()).toBe("dark");
  });

  it("ignora un valor guardado que no es un tema", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");

    initTheme();

    expect(getTheme()).toBe("light");
  });

  it("setTheme cambia la clase, guarda la elección y avisa a quien escucha", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeTheme(listener);

    setTheme("dark");

    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(listener).toHaveBeenCalledTimes(1);

    setTheme("light");

    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    setTheme("dark");

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("si localStorage falla, igual cambia el tema en la sesión", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });

    expect(() => initTheme()).not.toThrow();
    expect(getTheme()).toBe("light");

    expect(() => setTheme("dark")).not.toThrow();
    expect(getTheme()).toBe("dark");
  });
});
