#!/usr/bin/env node
// Chequeo de colores de la web (SPEC 09, Feature 9.7): `apps/web/src/index.css` es el único archivo con
// valores de color; todo lo demás usa clases de token (`bg-primary`, `text-muted-foreground`,
// `bg-tono-rojo`). Rechaza, dentro de strings y template literals de `apps/web/src/**/*.{ts,tsx}`:
//   - clases de la paleta de Tailwind (`bg-red-600`, `text-slate-500`, `border-white`, `ring-black`…);
//   - colores literales (`#f00`, `#ff0000`, `rgb(`, `hsl(`, `oklch(`…).
// Los comentarios no cuentan: se lee el árbol sintáctico con el compilador de TypeScript, y un comentario
// no es un nodo. No hay comentario de excepción: un color nuevo es un token nuevo en `index.css`.
//
// Uso:
//   node scripts/check-design-tokens.mjs                  # recorre apps/web/src
//   node scripts/check-design-tokens.mjs <archivo|dir>…   # recorre solo esas rutas (para probar el chequeo)
//
// Cada falla sale como `archivo:línea: <coincidencia>` y el script termina con código 1.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultRoot = path.join(repoRoot, "apps", "web", "src");

const IGNORED_FILES = new Set(["routeTree.gen.ts"]);
const EXTENSIONS = new Set([".ts", ".tsx"]);

const PALETTE_COLORS =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOR_UTILITIES =
  "bg|text|border(?:-[xytrblse])?|ring(?:-offset)?|outline|fill|stroke|from|via|to|divide|decoration|accent|caret|shadow|placeholder|inset-ring|inset-shadow";
// `bg-red-600`, `text-slate-500/50`, `border-white`, `ring-black`; ya sin variantes ni `!` ni `-`.
const PALETTE_CLASS = new RegExp(
  `^(?:${COLOR_UTILITIES})-(?:(?:${PALETTE_COLORS})-(?:\\d{2,3}|950)|white|black)(?:/.+)?$`,
);
// `#f00`, `#ff0000`, `#ff000080`: 3, 4, 6 u 8 dígitos hexadecimales, sin letras o números pegados.
const HEX_COLOR = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g;

function collectFiles(target, found = []) {
  const stat = statSync(target);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(target).sort()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      collectFiles(path.join(target, entry), found);
    }
  } else if (EXTENSIONS.has(path.extname(target)) && !IGNORED_FILES.has(path.basename(target))) {
    found.push(target);
  }
  return found;
}

// Las partes de texto de un archivo: strings y template literals. Los comentarios no son nodos.
function textNodes(sourceFile) {
  const nodes = [];
  const visit = (node) => {
    switch (node.kind) {
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      case ts.SyntaxKind.TemplateHead:
      case ts.SyntaxKind.TemplateMiddle:
      case ts.SyntaxKind.TemplateTail:
        nodes.push(node);
        break;
      default:
        break;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return nodes;
}

function isPaletteClass(token) {
  // Se descartan las variantes (`hover:`, `dark:`, `data-[x=y]:`) y el `!` / `-` iniciales.
  const utility = token.slice(token.lastIndexOf(":") + 1).replace(/^[!-]+/, "");
  return PALETTE_CLASS.test(utility);
}

function checkFile(file) {
  const text = readFileSync(file, "utf8");
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const failures = [];

  for (const node of textNodes(sourceFile)) {
    const start = node.getStart(sourceFile);
    const raw = node.getText(sourceFile);
    const report = (index, match) => {
      const { line } = sourceFile.getLineAndCharacterOfPosition(start + index);
      failures.push({ file, line: line + 1, match });
    };

    for (const token of raw.matchAll(/[^\s"'`${}]+/g)) {
      if (isPaletteClass(token[0])) report(token.index, token[0]);
    }
    for (const match of raw.matchAll(HEX_COLOR)) report(match.index, match[0]);
    for (const match of raw.matchAll(COLOR_FUNCTION)) report(match.index, match[0]);
  }
  return failures;
}

const targets = process.argv.slice(2).map((arg) => path.resolve(arg));
const files = (targets.length > 0 ? targets : [defaultRoot]).flatMap((target) =>
  collectFiles(target),
);

const failures = files.flatMap(checkFile);
// Dentro del repo, ruta relativa a la raíz; un archivo de afuera (una prueba) sale con su ruta completa.
const displayPath = (file) => {
  const relative = path.relative(repoRoot, file);
  return relative.startsWith("..") ? file : relative;
};
for (const { file, line, match } of failures) {
  console.error(`${displayPath(file)}:${line}: ${match}`);
}

if (failures.length > 0) {
  console.error(
    `\n${failures.length} color(es) fuera de los tokens. Usá una clase de token (bg-primary, ` +
      "text-muted-foreground, bg-tono-rojo…); un color nuevo es un token nuevo en apps/web/src/index.css.",
  );
  process.exit(1);
}
console.log(`check-design-tokens: ${files.length} archivos, sin colores sueltos.`);
