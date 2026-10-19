import { readFileSync } from "node:fs";
import path from "node:path";
import { criterion, defineSpec } from "../lib/spec.mjs";
import { assert, ROOT, readJson, rel, vitest, walk } from "../lib/util.mjs";

// SPEC 09 — sistema visual (etapa 9.1: tema). Chequeos estáticos sobre `apps/web/src/index.css`
// y los componentes; no levantan la API ni la base.
const WEB = path.join(ROOT, "apps/web");
const CSS = path.join(WEB, "src/index.css");

// Tokens que la maqueta exige en claro y en oscuro (SPEC 09, "Tokens").
const REQUIRED_TOKENS = [
  "background",
  "foreground",
  "body",
  "card",
  "primary",
  "primary-foreground",
  "secondary",
  "muted",
  "muted-foreground",
  "accent",
  "destructive",
  "success",
  "warning",
  "border",
  "line-soft",
  "input",
  "ring",
  "brand",
  "link",
  "feature",
  "feature-foreground",
  "feature-muted",
  "teal",
  "amber",
  "blue",
  "violet",
  "scrim",
  "neutral-dot",
  "sidebar",
];

// Cuerpo de un bloque CSS `selector { ... }` de primer nivel.
function block(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert(start !== -1, `index.css no tiene el bloque \`${selector}\``);
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  return css.slice(open + 1, close);
}

const declared = (body) => new Set([...body.matchAll(/^\s*--([a-z0-9-]+):/gm)].map((m) => m[1]));

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const TAILWIND_COLOR = new RegExp(
  `\\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|divide|decoration|accent|caret|shadow)-(?:${PALETTE})-\\d{2,3}\\b`,
);
const LITERAL_COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/;

export default defineSpec({
  id: "09",
  title: "Sistema visual",
  criteria: [
    criterion(1, "index.css define cada token de la maqueta en `:root` y en `.dark`", async () => {
      const css = readFileSync(CSS, "utf8");
      const light = declared(block(css, ":root"));
      const dark = declared(block(css, ".dark"));
      const missingLight = REQUIRED_TOKENS.filter((t) => !light.has(t));
      const missingDark = REQUIRED_TOKENS.filter((t) => !dark.has(t));
      assert(missingLight.length === 0, `faltan en :root: ${missingLight.join(", ")}`);
      assert(missingDark.length === 0, `faltan en .dark: ${missingDark.join(", ")}`);
      const onlyLight = [...light].filter((t) => t !== "radius" && !dark.has(t));
      assert(onlyLight.length === 0, `tokens de :root sin par en .dark: ${onlyLight.join(", ")}`);
    }),

    criterion(2, "Cada token nuevo se expone a Tailwind en `@theme inline`", async () => {
      const css = readFileSync(CSS, "utf8");
      const theme = block(css, "@theme inline");
      const missing = REQUIRED_TOKENS.filter((t) => !theme.includes(`--color-${t}: var(--${t});`));
      assert(missing.length === 0, `sin \`--color-*\` en @theme inline: ${missing.join(", ")}`);
    }),

    criterion(
      3,
      "El botón principal cumple AA: --primary con --primary-foreground ≥ 4,5:1",
      async () => {
        const css = readFileSync(CSS, "utf8");
        const light = block(css, ":root");
        const get = (name) => light.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
        const [bg, fg] = [get("primary"), get("primary-foreground")];
        assert(bg && fg, "--primary y --primary-foreground deben ser hex de 6 dígitos en :root");
        const lum = (hex) => {
          const [r, g, b] = [1, 3, 5]
            .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
            .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const [a, b] = [lum(bg), lum(fg)];
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        assert(ratio >= 4.5, `contraste ${ratio.toFixed(2)}:1 entre ${bg} y ${fg}`);
      },
    ),

    criterion(
      4,
      "Ningún componente de apps/web usa colores sueltos (hex, rgb, paleta de Tailwind)",
      async () => {
        const files = walk(path.join(WEB, "src"), (f) => /\.tsx?$/.test(f)).filter(
          (f) => !f.endsWith("routeTree.gen.ts"),
        );
        const offenders = [];
        for (const file of files) {
          readFileSync(file, "utf8")
            .split("\n")
            .forEach((line, i) => {
              if (TAILWIND_COLOR.test(line) || LITERAL_COLOR.test(line)) {
                offenders.push(`${rel(file)}:${i + 1}`);
              }
            });
        }
        assert(offenders.length === 0, `colores fuera de los tokens: ${offenders.join(", ")}`);
      },
    ),

    criterion(5, "Las cuatro fuentes se alojan con @fontsource y Geist ya no está", async () => {
      const pkg = readJson("apps/web/package.json");
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const wanted = [
        "@fontsource-variable/inter",
        "@fontsource/cormorant-garamond",
        "@fontsource-variable/jetbrains-mono",
        "@fontsource-variable/bricolage-grotesque",
      ];
      const missing = wanted.filter((d) => !deps[d]);
      assert(missing.length === 0, `faltan en package.json: ${missing.join(", ")}`);
      assert(!deps["@fontsource-variable/geist"], "Geist sigue en package.json");
      const css = readFileSync(CSS, "utf8");
      const notImported = wanted.filter((d) => !css.includes(`@import "${d}`));
      assert(notImported.length === 0, `index.css no importa: ${notImported.join(", ")}`);
      assert(!/google(apis|fonts)/i.test(css), "index.css carga fuentes de Google");
    }),

    // Etapa 9.2 — login. Se verifica con los tests de los componentes (jsdom), como en los SPEC 05 y 06.
    criterion(
      6,
      "El login muestra logo, título y campos; el envío vacío marca los dos campos; el completo manda usuario y contraseña",
      async () => {
        vitest(
          "@syc/web",
          "Los tests del formulario de login",
          "src/features/auth/components/LoginForm.test.tsx",
          "src/features/auth/components/LoginLayout.test.tsx",
          "src/components/common/Logo.test.tsx",
        );
      },
    ),

    criterion(
      7,
      "Cada fallo del login (invalid, rate-limited, disabled, unreachable) muestra su aviso con título y detalle",
      async () => {
        vitest(
          "@syc/web",
          "Los avisos de error del login",
          "src/features/auth/components/LoginForm.test.tsx",
        );
      },
    ),

    criterion(8, "«Mostrar»/«Ocultar» alterna el tipo del campo de contraseña", async () => {
      vitest(
        "@syc/web",
        "El botón de mostrar la contraseña",
        "src/features/auth/components/LoginForm.test.tsx",
      );
    }),

    criterion(
      9,
      "El interruptor pone o saca `dark` de <html>, guarda la elección, la restaura y cae en la preferencia del sistema",
      async () => {
        vitest(
          "@syc/web",
          "El tema claro/oscuro",
          "src/lib/theme.test.ts",
          "src/components/common/ThemeToggle.test.tsx",
        );
      },
    ),

    criterion(
      10,
      "main.tsx aplica el tema antes de renderizar y /login usa LoginLayout",
      async () => {
        const main = readFileSync(path.join(WEB, "src/main.tsx"), "utf8");
        const init = main.indexOf("initTheme();");
        const render = main.indexOf("createRoot(container).render(");
        assert(init !== -1, "main.tsx no llama a initTheme()");
        assert(render !== -1 && init < render, "initTheme() debe ir antes de renderizar");
        const login = readFileSync(path.join(WEB, "src/routes/login.tsx"), "utf8");
        assert(login.includes("<LoginLayout>"), "routes/login.tsx no usa LoginLayout");
      },
    ),
  ],
});
