import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { apiEnv } from "../lib/env.mjs";
import { ensureBuilt } from "../lib/infra.mjs";
import { criterion, defineSpec, skip } from "../lib/spec.mjs";
import { assert, ROOT, readJson, rel, run, tail, walk } from "../lib/util.mjs";

// SPEC 01 — esqueleto del monorepo. Solo los criterios automatizables sin levantar el compose
// (no cubre: levantar los servicios, el estado `degraded` ni el hot reload).
export default defineSpec({
  id: "01",
  title: "Esqueleto del monorepo",
  criteria: [
    criterion(6, "Arrancar la API sin DATABASE_URL aborta nombrando la variable", async () => {
      ensureBuilt();
      const env = { ...process.env, ...apiEnv("postgresql://x"), NODE_ENV: "development" };
      delete env.DATABASE_URL;
      const result = run(process.execPath, ["apps/api/dist/main.mjs"], { env });
      assert(result.status !== 0, "la API arrancó (o no terminó con error) sin DATABASE_URL");
      assert(
        result.output.includes("DATABASE_URL"),
        `el mensaje no nombra DATABASE_URL:\n${tail(result.output)}`,
      );
    }),

    criterion(
      7,
      "Cambiar `status` en healthStatusSchema rompe el typecheck de api y web",
      async () => {
        const file = path.join(ROOT, "packages/contracts/src/health.ts");
        const original = readFileSync(file, "utf8");
        assert(
          /^\s*status:/m.test(original),
          "no encuentro el campo `status` en healthStatusSchema",
        );
        const restore = () => writeFileSync(file, original);
        process.once("exit", restore);
        try {
          writeFileSync(file, original.replace(/^(\s*)status:/m, "$1estado:"));
          for (const pkg of ["@syc/api", "@syc/web"]) {
            const result = run("pnpm", ["--filter", pkg, "exec", "tsc", "--noEmit"]);
            assert(result.status !== 0, `${pkg}: typecheck pasó aunque cambió el contrato`);
          }
        } finally {
          restore();
          process.removeListener("exit", restore);
        }
      },
    ),

    criterion(
      9,
      "apps/api solo importa @prisma/client / @syc/db desde *.repository.ts (y auth.config.ts)",
      async () => {
        const allowed = (file) =>
          file.endsWith(".repository.ts") || file.endsWith("modules/auth/auth.config.ts");
        const pattern =
          /from\s+["'](@prisma\/client|@syc\/db)["']|require\(["'](@prisma\/client|@syc\/db)["']\)/;
        const offenders = walk(path.join(ROOT, "apps/api/src"), (f) => f.endsWith(".ts"))
          .filter((f) => !allowed(f) && pattern.test(readFileSync(f, "utf8")))
          .map(rel);
        assert(
          offenders.length === 0,
          `importan la base fuera de un repository: ${offenders.join(", ")}`,
        );
      },
    ),

    criterion(10, "Las rutas y componentes de apps/web no importan el cliente oRPC", async () => {
      const dirs = ["routes", "components"].map((d) => path.join(ROOT, "apps/web/src", d));
      const offenders = dirs
        .flatMap((dir) => walk(dir, (f) => /\.tsx?$/.test(f)))
        .filter((f) => /orpc-client/.test(readFileSync(f, "utf8")))
        .map(rel);
      assert(offenders.length === 0, `importan el cliente oRPC: ${offenders.join(", ")}`);
    }),

    criterion(11, "tsconfig base con strict y todos los paquetes lo extienden", async () => {
      const base = readJson("packages/config/tsconfig.base.json");
      assert(base.compilerOptions?.strict === true, "tsconfig.base.json no tiene strict: true");
      const configs = ["apps", "packages"].flatMap((d) =>
        walk(path.join(ROOT, d), (f) => path.basename(f) === "tsconfig.json"),
      );
      assert(configs.length > 0, "no encontré ningún tsconfig.json");
      const bad = configs.filter(
        (f) => !JSON.parse(readFileSync(f, "utf8")).extends?.includes("tsconfig.base.json"),
      );
      assert(bad.length === 0, `no extienden la base: ${bad.map(rel).join(", ")}`);
    }),

    criterion(12, "La mayor de Prisma está fijada sin `latest` ni `^`", async () => {
      const manifests = ["packages/db/package.json", "apps/api/package.json"].map(readJson);
      const versions = manifests
        .flatMap((m) =>
          ["prisma", "@prisma/client"].map((name) => ({
            name,
            v: m.dependencies?.[name] ?? m.devDependencies?.[name],
          })),
        )
        .filter((x) => x.v);
      assert(versions.length > 0, "no encontré prisma ni @prisma/client en los package.json");
      const bad = versions.filter((x) => !/^\d+\.\d+\.\d+$/.test(x.v));
      assert(
        bad.length === 0,
        `versiones no exactas: ${bad.map((x) => `${x.name}@${x.v}`).join(", ")}`,
      );
    }),

    criterion(13, ".github/workflows/ci.yml existe y es YAML válido", async () => {
      const file = path.join(ROOT, ".github/workflows/ci.yml");
      assert(existsSync(file), "no existe .github/workflows/ci.yml");
      const result = run("python3", [
        "-c",
        "import sys,yaml; yaml.safe_load(open(sys.argv[1]))",
        file,
      ]);
      if (result.status !== 0 && /No module named 'yaml'/.test(result.stderr)) {
        return skip("python3 sin el módulo yaml: no pude validar la sintaxis");
      }
      assert(result.status === 0, `YAML inválido:\n${tail(result.stderr)}`);
    }),

    criterion(14, "CLAUDE.md: todos los scripts pnpm que lista existen", async () => {
      const text = readFileSync(path.join(ROOT, "CLAUDE.md"), "utf8");
      const packages = {
        "@syc/api": "apps/api",
        "@syc/web": "apps/web",
        "@syc/db": "packages/db",
        "@syc/contracts": "packages/contracts",
        "@syc/config": "packages/config",
      };
      const builtin = new Set(["install", "exec", "turbo", "dlx", "add", "run"]);
      const missing = [];
      for (const line of text.split("\n")) {
        const match = line.match(/^\s*pnpm\s+(?:--filter\s+(\S+)\s+)?([\w:-]+)/);
        if (!match || builtin.has(match[2])) continue;
        const dir = match[1] ? packages[match[1]] : ".";
        if (!dir) {
          missing.push(`${match[0].trim()} (paquete desconocido)`);
          continue;
        }
        const scripts = readJson(path.join(dir, "package.json")).scripts ?? {};
        if (!scripts[match[2]]) missing.push(match[0].trim());
      }
      assert(missing.length === 0, `scripts que no existen: ${missing.join("; ")}`);
    }),
  ],
});
