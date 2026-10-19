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
  "brand-foreground",
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
  "note",
  "note-foreground",
  "note-muted",
  "note-border",
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

    // Etapa 9.3 — layout autenticado. Se verifica con los tests de los componentes (jsdom).
    criterion(
      11,
      "La barra lateral muestra Tickets a todos y Administración solo al admin; la página actual lleva aria-current",
      async () => {
        vitest(
          "@syc/web",
          "La barra lateral",
          "src/components/layout/Sidebar.test.tsx",
          "src/components/layout/AppShell.test.tsx",
        );
      },
    ),

    criterion(
      12,
      "«Catálogos» despliega los 8 catálogos solo dentro de /admin/catalogos",
      async () => {
        vitest("@syc/web", "El submenú de catálogos", "src/components/layout/Sidebar.test.tsx");
      },
    ),

    criterion(13, "Las migas de pan de cada ruta son las del SPEC", async () => {
      vitest(
        "@syc/web",
        "Las migas de pan",
        "src/components/layout/navigation.test.ts",
        "src/components/layout/Topbar.test.tsx",
      );
    }),

    criterion(
      14,
      "La barra superior muestra avatar, nombre, tema, cambio de contraseña y cierre de sesión",
      async () => {
        vitest("@syc/web", "La barra superior", "src/components/layout/Topbar.test.tsx");
      },
    ),

    criterion(
      15,
      "La tarjeta «Próximamente» usa los tokens --note-* y no hay colores sueltos",
      async () => {
        const sidebar = readFileSync(path.join(WEB, "src/components/layout/Sidebar.tsx"), "utf8");
        for (const token of [
          "bg-note",
          "text-note-foreground",
          "text-note-muted",
          "border-note-border",
        ]) {
          assert(sidebar.includes(token), `Sidebar.tsx no usa \`${token}\``);
        }
        const css = readFileSync(CSS, "utf8");
        const light = declared(block(css, ":root"));
        const dark = declared(block(css, ".dark"));
        for (const token of ["note", "note-foreground", "note-muted", "note-border"]) {
          assert(light.has(token) && dark.has(token), `--${token} falta en :root o en .dark`);
        }
      },
    ),

    // Etapa 9.4 — bandeja de tickets. Se verifica con los tests de los componentes (jsdom).
    criterion(
      16,
      "El color de cada estado y prioridad sale de las reglas del SPEC (clave, posición, desde la última)",
      async () => {
        vitest(
          "@syc/web",
          "El color de estados y prioridades",
          "src/features/tickets/ticket-colors.test.ts",
        );
      },
    ),

    criterion(
      17,
      "La fila muestra el número como único enlace, el estado en una píldora con su punto y la prioridad con su punto y su nombre",
      async () => {
        vitest(
          "@syc/web",
          "La tabla de la bandeja",
          "src/features/tickets/components/TicketsList.test.tsx",
        );
      },
    ),

    criterion(
      18,
      "La barra de filtros tiene la fila principal y «Más filtros» (con la cuenta y abierto si la URL trae uno)",
      async () => {
        vitest(
          "@syc/web",
          "Los filtros de la bandeja",
          "src/features/tickets/components/TicketsFilters.test.tsx",
        );
      },
    ),

    criterion(
      19,
      "Los filtros, la búsqueda con pausa y «Limpiar filtros» siguen contra la URL",
      async () => {
        vitest(
          "@syc/web",
          "La bandeja con los filtros en la URL",
          "src/features/tickets/components/TicketsFilters.test.tsx",
          "src/features/tickets/components/TicketsList.router.test.tsx",
          "src/features/tickets/tickets-search.test.ts",
          "src/routes/_authenticated/tickets/index.test.ts",
        );
      },
    ),

    criterion(
      20,
      "El pie muestra «Mostrando a–b de N · Página p de n» y los enlaces Anterior/Siguiente que conservan los filtros",
      async () => {
        vitest(
          "@syc/web",
          "La paginación de la bandeja",
          "src/features/tickets/components/TicketsList.test.tsx",
          "src/features/tickets/components/TicketsList.router.test.tsx",
        );
      },
    ),

    criterion(
      21,
      "El encabezado ofrece «Nuevo ticket» y la bandeja conserva sus estados",
      async () => {
        vitest(
          "@syc/web",
          "Los estados de la bandeja",
          "src/features/tickets/components/TicketsList.test.tsx",
        );
      },
    ),

    // Etapa 9.5 — formulario y detalle de ticket. Se verifica con los tests de los componentes (jsdom).
    criterion(
      22,
      "El alta muestra sus dos secciones con contadores y «Usar hoy»; admin y agente ven su departamento como corresponde; valida y envía",
      async () => {
        vitest(
          "@syc/web",
          "El formulario de alta",
          "src/features/tickets/components/CreateTicketForm.test.tsx",
          "src/features/tickets/components/Field.test.tsx",
        );
      },
    ),

    criterion(
      23,
      "La edición muestra las cuatro secciones, las fechas de cierre y reapertura solo si existen, y guarda, descarta y avisa del conflicto",
      async () => {
        vitest(
          "@syc/web",
          "El formulario de edición",
          "src/features/tickets/components/TicketForm.test.tsx",
        );
      },
    ),

    criterion(
      24,
      "Las pestañas Datos, Comentarios e Historial cambian de panel con el mouse y las flechas, sin desmontar lo escrito",
      async () => {
        vitest(
          "@syc/web",
          "Las pestañas del ticket",
          "src/features/tickets/components/TicketTabs.test.tsx",
          "src/features/tickets/components/TicketDetail.test.tsx",
        );
      },
    ),

    criterion(
      25,
      "La barra fija tiene las acciones de cada formulario y muestra el aviso de guardado y los errores del servidor",
      async () => {
        vitest(
          "@syc/web",
          "La barra de acciones",
          "src/components/common/FormSection.test.tsx",
          "src/features/tickets/components/CreateTicketForm.test.tsx",
          "src/features/tickets/components/TicketForm.test.tsx",
          "src/features/tickets/components/TicketDetail.test.tsx",
        );
      },
    ),

    criterion(
      26,
      "El encabezado muestra número, título, estado y departamento, y sus acciones según el rol y los cambios sin guardar",
      async () => {
        vitest(
          "@syc/web",
          "El encabezado del ticket",
          "src/features/tickets/components/TicketDetail.test.tsx",
        );
      },
    ),

    criterion(
      27,
      "Los comentarios se ven como conversación; comentar valida, envía y limpia; solo el admin elimina",
      async () => {
        vitest(
          "@syc/web",
          "Los comentarios",
          "src/features/tickets/components/TicketComments.test.tsx",
        );
      },
    ),

    criterion(
      28,
      "El historial muestra cada movimiento con su fecha, su autor y sus cambios",
      async () => {
        vitest(
          "@syc/web",
          "El historial",
          "src/features/tickets/components/TicketHistory.test.tsx",
        );
      },
    ),

    criterion(
      29,
      "La prioridad muestra su punto de color dentro del selector, con la misma regla que la bandeja",
      async () => {
        vitest(
          "@syc/web",
          "El punto de la prioridad",
          "src/features/tickets/components/TicketBadges.test.tsx",
          "src/features/tickets/components/CatalogOptionSelect.test.tsx",
          "src/features/tickets/ticket-colors.test.ts",
        );
      },
    ),
  ],
});
