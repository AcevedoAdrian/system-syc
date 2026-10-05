// Lista de SPEC que verifica `pnpm verify`, en orden. Para sumar uno nuevo:
//   1. crear `NN-nombre.mjs` en esta carpeta con `export default defineSpec({ ... })`
//      (la forma de declararlo está en `../lib/spec.mjs`; los fixtures reutilizables, en `../lib/`);
//   2. importarlo acá y agregarlo a la lista.
import spec01 from "./01-esqueleto.mjs";
import spec02 from "./02-autenticacion.mjs";

export const SPECS = [spec01, spec02];
