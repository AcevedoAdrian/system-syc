// Lista de SPEC que verifica `pnpm verify`, en orden. Para sumar uno nuevo:
//   1. crear `NN-nombre.mjs` en esta carpeta con `export default defineSpec({ ... })`
//      (la forma de declararlo está en `../lib/spec.mjs`; los fixtures reutilizables, en `../lib/`);
//   2. importarlo acá y agregarlo a la lista.
import spec01 from "./01-esqueleto.mjs";
import spec02 from "./02-autenticacion.mjs";
import spec03 from "./03-auditoria.mjs";
import spec04 from "./04-catalogos.mjs";
import spec05 from "./05-tickets.mjs";
import spec06 from "./06-comentarios-bandeja.mjs";
import spec07 from "./07-endurecimiento-despliegue.mjs";

export const SPECS = [spec01, spec02, spec03, spec04, spec05, spec06, spec07];
