import { OPTIONS } from "./options.mjs";
import { criterion, skip } from "./spec.mjs";
import { assert, run, tail } from "./util.mjs";

// Criterio que se repite en todos los SPEC: "`pnpm turbo lint typecheck test build` termina con 0".
// El comando corre una sola vez por ejecución del verificador; los demás SPEC reutilizan el resultado.
let turboRun = null;

export const turboCriterion = (n) =>
  criterion(
    n,
    "`pnpm turbo lint typecheck test build` termina con código 0",
    async () => {
      if (OPTIONS.skipTurbo) return skip("--skip-turbo");
      turboRun ??= run("pnpm", ["turbo", "lint", "typecheck", "test", "build"]);
      assert(
        turboRun.status === 0,
        `turbo terminó con código ${turboRun.status}:\n${tail(turboRun.output, 40)}`,
      );
    },
    { infra: false, first: true },
  );
