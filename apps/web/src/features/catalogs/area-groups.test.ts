import { describe, expect, it } from "vitest";
import { groupAreasByTipo } from "./area-groups";

const dip = { id: "dip", nombre: "Diputado" };
const dir = { id: "dir", nombre: "Dirección" };
const vacio = { id: "vac", nombre: "Vacío" };

describe("groupAreasByTipo", () => {
  it("agrupa por tipo en el orden de los tipos y conserva el orden de las áreas", () => {
    const areas = [
      { id: "a", nombre: "Archivo", tipo: dir },
      { id: "b", nombre: "Acosta", tipo: dip },
      { id: "c", nombre: "Sistemas", tipo: dir },
    ];

    const { groups, rest } = groupAreasByTipo(areas, [dip, dir]);

    expect(groups.map((g) => [g.tipo.id, g.areas.map((a) => a.id)])).toEqual([
      ["dip", ["b"]],
      ["dir", ["a", "c"]],
    ]);
    expect(rest).toEqual([]);
  });

  it("no devuelve un grupo sin áreas", () => {
    const { groups } = groupAreasByTipo([{ id: "a", nombre: "Acosta", tipo: dip }], [vacio, dip]);

    expect(groups.map((g) => g.tipo.id)).toEqual(["dip"]);
  });

  it("deja aparte las áreas sin tipo o de un tipo desconocido", () => {
    const areas = [
      { id: "a", nombre: "Acosta", tipo: dip },
      { id: "b", nombre: "Huérfana", tipo: dir },
      { id: "c", nombre: "Sin tipo" },
    ];

    const { groups, rest } = groupAreasByTipo(areas, [dip]);

    expect(groups).toHaveLength(1);
    expect(rest.map((a) => a.id)).toEqual(["b", "c"]);
  });

  it("sin tipos cargados, todas las áreas quedan aparte", () => {
    const areas = [{ id: "a", nombre: "Acosta", tipo: dip }];

    expect(groupAreasByTipo(areas, [])).toEqual({ groups: [], rest: areas });
  });
});
