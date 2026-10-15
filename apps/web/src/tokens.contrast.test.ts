import { readFileSync } from "node:fs";
import path from "node:path";
import { tonos } from "@syc/contracts";
import { parse, rgb, wcagContrast } from "culori";
import { describe, expect, it } from "vitest";

// La base visual (SPEC 09) vive en `index.css`: este test lo lee y exige AA (4,5:1) en cada texto y en
// cada tono, en el tema claro y en el oscuro. Si cambia un valor, se rompe acá y no en una pantalla.

const MIN = 4.5;

const css = readFileSync(path.join(import.meta.dirname, "index.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

// Devuelve el contenido del bloque `{ ... }` que abre `header`, con llaves balanceadas.
function blockAfter(source: string, header: string): string {
  const start = source.indexOf(header);
  if (start === -1) throw new Error(`No se encontró «${header}» en index.css`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    if (depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`Bloque «${header}» sin cerrar`);
}

function variables(block: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const match of block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name && value) vars[name] = value.trim();
  }
  return vars;
}

const darkMedia = blockAfter(css, "@media (prefers-color-scheme: dark) {");
const themes = {
  claro: variables(blockAfter(css.replace(darkMedia, ""), ":root {")),
  oscuro: variables(blockAfter(darkMedia, ":root {")),
} as const;

function color(theme: Record<string, string>, name: string) {
  const value = theme[name];
  if (!value) throw new Error(`Falta el token --${name}`);
  const parsed = parse(value);
  if (!parsed) throw new Error(`--${name}: «${value}» no es un color`);
  return parsed;
}

function contrast(theme: Record<string, string>, fg: string, bg: string): number {
  return wcagContrast(color(theme, fg), color(theme, bg));
}

// El texto de un `bg-x/10` o `bg-x/20` se lee sobre el color mezclado con el fondo, no sobre `x`.
function contrastOnTint(
  theme: Record<string, string>,
  fg: string,
  tint: string,
  alpha: number,
  under: string,
): number {
  const t = rgb(color(theme, tint));
  const u = rgb(color(theme, under));
  if (!t || !u) throw new Error("Color no convertible");
  const mixed = {
    mode: "rgb" as const,
    r: t.r * alpha + u.r * (1 - alpha),
    g: t.g * alpha + u.g * (1 - alpha),
    b: t.b * alpha + u.b * (1 - alpha),
  };
  return wcagContrast(color(theme, fg), mixed);
}

// [texto, fondo]: cada `*-foreground` sobre el fondo en el que se usa.
const textPairs: Array<[string, string]> = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["foreground", "popover"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["muted-foreground", "popover"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["primary-foreground", "primary"],
  ["primary-foreground", "primary-active"],
  ["success-foreground", "success"],
  ["warning-foreground", "warning"],
  ["info-foreground", "info"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-primary-foreground", "sidebar-primary"],
  ["sidebar-accent-foreground", "sidebar-accent"],
  // Colores que además se usan como texto sobre el fondo (enlaces y mensajes).
  ["primary", "background"],
  ["success", "background"],
  ["warning", "background"],
  ["info", "background"],
  ["destructive", "background"],
  ["destructive", "card"],
  ...tonos.map((t): [string, string] => [`tono-${t}-foreground`, `tono-${t}`]),
];

describe("tokens de color de index.css", () => {
  it("no tiene un bloque .dark: el tema oscuro sale de prefers-color-scheme", () => {
    expect(css).not.toMatch(/(^|\s)\.dark\b/);
    expect(css).toContain("@custom-variant dark (@media (prefers-color-scheme: dark))");
  });

  it("define en el tema oscuro los mismos tokens que en el claro", () => {
    // `--radius` no es un color: solo se define en el tema claro.
    const colorTokens = (theme: Record<string, string>) =>
      Object.keys(theme)
        .filter((name) => name !== "radius")
        .sort();
    expect(colorTokens(themes.oscuro)).toEqual(colorTokens(themes.claro));
  });

  it("cada tono define fondo, texto y borde", () => {
    for (const tono of tonos) {
      for (const suffix of ["", "-foreground", "-border"]) {
        expect(themes.claro[`tono-${tono}${suffix}`], `tono-${tono}${suffix}`).toBeDefined();
      }
    }
  });

  for (const [themeName, theme] of Object.entries(themes)) {
    describe(`tema ${themeName}`, () => {
      it.each(textPairs)("%s sobre %s tiene 4,5:1 o más", (fg, bg) => {
        expect(contrast(theme, fg, bg), `--${fg} sobre --${bg}`).toBeGreaterThanOrEqual(MIN);
      });

      it("el texto destructivo se lee sobre su tinte (botón e insignia)", () => {
        const alpha = themeName === "claro" ? 0.1 : 0.2;
        for (const under of ["background", "card", "muted"]) {
          expect(
            contrastOnTint(theme, "destructive", "destructive", alpha, under),
            `destructive/${alpha * 100} sobre --${under}`,
          ).toBeGreaterThanOrEqual(MIN);
        }
      });
    });
  }
});
