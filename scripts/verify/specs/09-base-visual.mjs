import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { turboCriterion } from "../lib/shared-criteria.mjs";
import { criterion, defineSpec } from "../lib/spec.mjs";
import { assert, ROOT, run, tail, vitest, walk } from "../lib/util.mjs";

// SPEC 09 — base visual. Solo lo que vive en el repo: los tokens, los componentes compartidos, la
// galería, el chequeo de colores y los documentos. No necesita la API ni una base temporal.
//
// No están cubiertos (se verifican a mano, como dice el SPEC en sus pasos 1, 7 y 9): los criterios 1 a 5
// y 17 (lo que depende de una herramienta instalada solo en la máquina de desarrollo), el 8 y el 9 (que
// archivos de configuración compartidos no cambiaron ni la nombran), el 18 (sin scroll horizontal a
// 1024 px, que pide un navegador) y la mitad del 11 (que con el sistema operativo en oscuro la app se
// ve en oscuro: acá se verifica que el tema oscuro sale de `prefers-color-scheme`).

const WEB = path.join(ROOT, "apps/web");
const SRC = path.join(WEB, "src");
const INDEX_CSS = path.join(SRC, "index.css");
const CHECK_SCRIPT = path.join(ROOT, "scripts/check-design-tokens.mjs");

const TONOS = ["gris", "rojo", "naranja", "amarillo", "verde", "azul", "violeta", "rosa"];
const SHARED_COMPONENTS = ["Page", "PageHeader", "LoadingState", "EmptyState", "ErrorState"];

const read = (file) => readFileSync(file, "utf8");
const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

// `git check-ignore -q` termina con 0 si la ruta está ignorada y con 1 si no.
const isGitIgnored = (file) => run("git", ["check-ignore", "-q", file]).status === 0;

// Corre el chequeo de colores sobre archivos sueltos; devuelve su salida y su código.
function checkTokens(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "syc-tokens-"));
  try {
    const paths = Object.entries(files).map(([name, content]) => {
      const file = path.join(dir, name);
      writeFileSync(file, content);
      return file;
    });
    return { ...run(process.execPath, [CHECK_SCRIPT, ...paths]), dir };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export default defineSpec({
  id: "09",
  title: "Base visual",
  criteria: [
    criterion(
      6,
      "`apps/web/PRODUCT.md` y `apps/web/DESIGN.md` están en git; DESIGN.md documenta los tokens, los 8 tonos y los componentes compartidos",
      async () => {
        for (const name of ["PRODUCT.md", "DESIGN.md"]) {
          const file = path.join(WEB, name);
          assert(existsSync(file), `no existe apps/web/${name}`);
          assert(!isGitIgnored(file), `apps/web/${name} está ignorado por git: no se versionaría`);
        }
        const design = read(path.join(WEB, "DESIGN.md"));
        assert(/^colors:/m.test(design), "DESIGN.md no tiene los tokens de color en su encabezado");
        const missingTonos = TONOS.filter((tono) => !design.includes(`tono-${tono}`));
        assert(missingTonos.length === 0, `DESIGN.md no documenta los tonos: ${missingTonos}`);
        const missingComponents = SHARED_COMPONENTS.filter((name) => !design.includes(name));
        assert(
          missingComponents.length === 0,
          `DESIGN.md no documenta los componentes: ${missingComponents}`,
        );
      },
      { infra: false },
    ),

    criterion(7, "`docs/base-visual.md` existe y tiene la sección «Módulos nuevos»", async () => {
      const file = path.join(ROOT, "docs/base-visual.md");
      assert(existsSync(file), "no existe docs/base-visual.md");
      assert(/^## Módulos nuevos\s*$/m.test(read(file)), "falta la sección «Módulos nuevos»");
    }),

    criterion(
      10,
      "La sección «Dirección elegida» del SPEC describe la propuesta que eligió el usuario",
      async () => {
        // El archivo del SPEC se busca por su número: así el script no depende del slug del nombre.
        const file = readdirSync(path.join(ROOT, "specs")).find((f) => /^09-.*\.md$/.test(f));
        assert(file, "no encuentro el archivo del SPEC 09 en specs/");
        const spec = read(path.join(ROOT, "specs", file));
        const match = spec.match(/^## Dirección elegida\s*\n([\s\S]*?)(?=^## )/m);
        assert(match, "no encuentro la sección «Dirección elegida» en el SPEC");
        const body = match[1].trim();
        assert(
          !body.startsWith("_Se completa"),
          "«Dirección elegida» sigue con el texto de relleno",
        );
        assert(
          body.length > 300,
          "«Dirección elegida» es demasiado corta para describir la propuesta",
        );
      },
    ),

    criterion(
      11,
      "`index.css` no tiene bloque `.dark`; el tema oscuro sale de `prefers-color-scheme`",
      async () => {
        const css = stripCssComments(read(INDEX_CSS));
        assert(!/(^|[\s,}])\.dark\b/.test(css), "index.css todavía tiene un bloque `.dark`");
        assert(
          css.includes("@custom-variant dark (@media (prefers-color-scheme: dark))"),
          "la variante `dark` no sale de `prefers-color-scheme`",
        );
        assert(
          /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{/.test(css),
          "no hay un bloque `:root` dentro de `@media (prefers-color-scheme: dark)`",
        );
      },
    ),

    criterion(
      12,
      "`tokens.contrast.test.ts` pasa: cada texto y cada tono tienen 4,5:1 o más, en claro y en oscuro",
      async () => {
        vitest("@syc/web", "tokens.contrast.test.ts", "src/tokens.contrast.test.ts");
      },
    ),

    criterion(
      13,
      "La fuente se sirve desde el build: el CSS del build no referencia otros orígenes",
      async () => {
        const build = run("pnpm", ["--filter", "@syc/web", "build"]);
        assert(build.status === 0, `el build de la web falla:\n${tail(build.output, 30)}`);

        const assets = path.join(WEB, "dist/assets");
        const files = readdirSync(assets);
        assert(
          files.some((f) => f.endsWith(".woff2")),
          "el build no emitió ninguna fuente (.woff2)",
        );

        const isExternal = (url) => /^(https?:)?\/\//i.test(url.trim());
        const external = [];
        for (const file of files.filter((f) => f.endsWith(".css"))) {
          const css = stripCssComments(read(path.join(assets, file)));
          for (const m of css.matchAll(/url\(\s*["']?([^"')]+)/g)) {
            if (isExternal(m[1])) external.push(`${file}: ${m[1]}`);
          }
          for (const m of css.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/g)) {
            if (isExternal(m[1])) external.push(`${file}: @import ${m[1]}`);
          }
        }
        const html = read(path.join(WEB, "dist/index.html"));
        for (const m of html.matchAll(/<(?:link|script)\b[^>]*(?:href|src)=["']([^"']+)/g)) {
          if (isExternal(m[1])) external.push(`index.html: ${m[1]}`);
        }
        assert(
          external.length === 0,
          `el build referencia otros orígenes:\n${external.join("\n")}`,
        );
      },
    ),

    criterion(
      14,
      "`Page`, `PageHeader`, `LoadingState`, `EmptyState`, `ErrorState` y `Badge` con `tono` existen y tienen tests",
      async () => {
        const common = path.join(SRC, "components/common");
        for (const name of SHARED_COMPONENTS) {
          assert(
            existsSync(path.join(common, `${name}.tsx`)),
            `falta components/common/${name}.tsx`,
          );
        }
        for (const name of ["PageHeader", "LoadingState", "EmptyState", "ErrorState"]) {
          assert(
            existsSync(path.join(common, `${name}.test.tsx`)),
            `falta el test de ${name} (components/common/${name}.test.tsx)`,
          );
        }
        assert(
          existsSync(path.join(SRC, "components/ui/badge.test.tsx")),
          "falta el test de Badge (components/ui/badge.test.tsx)",
        );
        vitest(
          "@syc/web",
          "los tests de los componentes compartidos",
          "src/components/common",
          "src/components/ui/badge.test.tsx",
        );
      },
    ),

    criterion(
      15,
      "`/estilos` muestra la galería en desarrollo y responde «no encontrado» en producción",
      async () => {
        assert(
          existsSync(path.join(SRC, "routes/_authenticated/estilos.tsx")),
          "falta routes/_authenticated/estilos.tsx",
        );
        vitest("@syc/web", "los tests de la galería", "src/features/estilos");
      },
    ),

    criterion(
      16,
      "`HealthIndicator` usa `success`, `warning` y `destructive`, con texto además del color",
      async () => {
        const source = read(path.join(SRC, "features/health/components/HealthIndicator.tsx"));
        for (const token of ["bg-success", "bg-warning", "bg-destructive"]) {
          assert(source.includes(token), `HealthIndicator no usa ${token}`);
        }
        vitest(
          "@syc/web",
          "HealthIndicator.test.tsx",
          "src/features/health/components/HealthIndicator.test.tsx",
        );
      },
    ),

    criterion(
      19,
      "Ningún archivo de `apps/web/src` salvo `index.css` tiene clases de la paleta de Tailwind ni colores literales",
      async () => {
        const result = run(process.execPath, [CHECK_SCRIPT]);
        assert(result.status === 0, `el chequeo de colores falla:\n${tail(result.output, 30)}`);
        const files = walk(SRC, (f) => /\.tsx?$/.test(f) && !f.endsWith("routeTree.gen.ts"));
        assert(files.length > 0, "el chequeo no tendría nada que recorrer en apps/web/src");
      },
    ),

    criterion(
      20,
      'El chequeo de colores falla nombrando archivo y línea ante `bg-red-600` o `"#ff0000"`, y no falla por un comentario con `#123`',
      async () => {
        const bad = checkTokens({
          "clase.tsx": 'export const A = () => <p className="p-2 bg-red-600">x</p>;\n',
          "literal.ts": 'export const n = 1;\nexport const color = "#ff0000";\n',
        });
        assert(bad.status === 1, `debía fallar con código 1 y terminó con ${bad.status}`);
        assert(
          /clase\.tsx:1: bg-red-600/.test(bad.output),
          `no nombra archivo y línea de la clase:\n${bad.output}`,
        );
        assert(
          /literal\.ts:2: #ff0000/.test(bad.output),
          `no nombra archivo y línea del literal:\n${bad.output}`,
        );

        const ok = checkTokens({
          "comentario.ts": [
            "// PR #123 y el bug #fff de ayer",
            "/* también #f00, bg-red-600 y rgb(0, 0, 0) */",
            'export const texto = "Ticket #12";',
            "",
          ].join("\n"),
        });
        assert(ok.status === 0, `un comentario con #123 no debía fallar:\n${ok.output}`);

        const lint = JSON.parse(read(path.join(ROOT, "package.json"))).scripts?.lint ?? "";
        assert(
          lint.includes("scripts/check-design-tokens.mjs"),
          "`pnpm lint` no corre el chequeo de colores",
        );
      },
    ),

    criterion(
      21,
      "Las pantallas de tickets y administración se comportan igual: todos sus tests pasan",
      async () => {
        vitest(
          "@syc/web",
          "los tests de tickets y administración",
          "src/features/tickets",
          "src/features/catalogs",
          "src/features/users",
          "src/features/organizations",
        );
      },
    ),

    criterion(
      22,
      "`apps/web/CLAUDE.md` tiene la sección «Base visual», con el enlace a `docs/base-visual.md`",
      async () => {
        const doc = read(path.join(WEB, "CLAUDE.md"));
        const match = doc.match(/^## Base visual\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m);
        assert(match, "falta la sección «Base visual» en apps/web/CLAUDE.md");
        assert(
          match[1].includes("docs/base-visual.md"),
          "la sección «Base visual» no enlaza a docs/base-visual.md",
        );
      },
    ),

    turboCriterion(23),
  ],
});
