// Cómo se declara un SPEC para el verificador (ver specs/index.mjs para agregar uno nuevo).
//
//   export default defineSpec({
//     id: "03",
//     title: "Auditoría y soft delete",
//     infra: true, // los criterios necesitan base temporal + API (lib/infra.mjs); default: false
//     criteria: [
//       criterion(1, "Texto del criterio, tal como figura en el SPEC", async () => {
//         // lanzar un Error (assert, assertStatus, fail) = el criterio falla
//         // return skip("motivo") = se omite (no es un fallo)
//       }),
//       criterion(2, "Otro criterio que no necesita la API", async () => {}, { infra: false }),
//     ],
//   });
//
// El id completo de cada criterio es `<id del spec>.<n>` (`03.1`) y sirve para `--only`.

const SKIP = Symbol("skip");

export const skip = (reason) => ({ [SKIP]: reason });
export const skipReason = (result) => result?.[SKIP];

// `infra` y `first` son opcionales: `infra` pisa el del spec; `first` ejecuta el criterio antes que
// el resto (lo usa el de `turbo`, porque su build deja `dist/` listo).
export function criterion(n, title, run, { infra, first = false } = {}) {
  return { n, title, run, infra, first };
}

export function defineSpec({ id, title, infra = false, criteria }) {
  const seen = new Set();
  return {
    id,
    title,
    criteria: criteria.map((c) => {
      const full = `${id}.${c.n}`;
      if (seen.has(full)) throw new Error(`criterio duplicado en el spec ${id}: ${full}`);
      seen.add(full);
      return { id: full, title: c.title, run: c.run, infra: c.infra ?? infra, first: c.first };
    }),
  };
}
