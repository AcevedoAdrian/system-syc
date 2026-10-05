#!/usr/bin/env node
import { teardownInfra } from "./verify/lib/infra.mjs";
// Verifica los criterios de aceptación de los SPEC (los que se pueden automatizar).
//
// Uso:
//   pnpm verify                      # todo
//   pnpm verify --spec 02            # solo un SPEC (el id de `scripts/verify/specs/index.mjs`)
//   pnpm verify --only 02.7,02.19    # solo algunos criterios (ids "<spec>.<n>", n = posición en el SPEC)
//   pnpm verify --skip-turbo         # omite `pnpm turbo lint typecheck test build` (el más lento)
//   pnpm verify --keep-db            # no borra la base temporal al terminar
//
// Los criterios que necesitan la API se prueban contra una API real (build de producción,
// NODE_ENV=production) y una base de datos TEMPORAL creada en el Postgres de `docker compose`; la base
// de desarrollo no se toca. Requiere Node 22, pnpm y Docker. Sale con código 1 si algún criterio falla.
//
// Estructura:
//   scripts/verify/lib/     piezas reutilizables (entorno, infraestructura, cliente HTTP, fixtures, runner)
//   scripts/verify/specs/   un archivo por SPEC con sus criterios; `index.mjs` los lista
import { runSpecs } from "./verify/lib/runner.mjs";
import { SPECS } from "./verify/specs/index.mjs";

try {
  process.exit(await runSpecs(SPECS));
} catch (error) {
  console.error(error);
  await teardownInfra().catch(() => {});
  process.exit(1);
}
