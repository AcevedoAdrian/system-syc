import { describe, expect, it } from "vitest";
import { computeDiff, pickSnapshot } from "./audit-diff";

describe("computeDiff", () => {
  it("devuelve solo los campos que cambiaron", () => {
    const diff = computeDiff(
      { nombre: "Soporte", activo: true },
      { nombre: "Mesa de ayuda", activo: true },
    );

    expect(diff).toEqual({ before: { nombre: "Soporte" }, after: { nombre: "Mesa de ayuda" } });
  });

  it("devuelve null cuando no cambió nada", () => {
    expect(
      computeDiff({ nombre: "Soporte", activo: true }, { nombre: "Soporte", activo: true }),
    ).toBeNull();
  });

  it("compara objetos anidados por valor (departamento)", () => {
    const same = computeDiff(
      { departamento: { id: "d1", nombre: "Soporte" } },
      { departamento: { id: "d1", nombre: "Soporte" } },
    );
    const moved = computeDiff(
      { departamento: { id: "d1", nombre: "Soporte" } },
      { departamento: { id: "d2", nombre: "Redes" } },
    );

    expect(same).toBeNull();
    expect(moved).toEqual({
      before: { departamento: { id: "d1", nombre: "Soporte" } },
      after: { departamento: { id: "d2", nombre: "Redes" } },
    });
  });

  it("distingue null de un valor (agente sin departamento que pasa a tener uno)", () => {
    const diff = computeDiff(
      { departamento: null },
      { departamento: { id: "d1", nombre: "Soporte" } },
    );

    expect(diff).toEqual({
      before: { departamento: null },
      after: { departamento: { id: "d1", nombre: "Soporte" } },
    });
  });
});

describe("pickSnapshot", () => {
  it("deja fuera los campos que no están en la lista auditable", () => {
    const organization = { id: "o1", name: "Soporte", slug: "soporte", activo: true, agentes: 3 };

    const snapshot = pickSnapshot(organization, ["name", "activo"]);

    expect(snapshot).toEqual({ name: "Soporte", activo: true });
    expect(snapshot).not.toHaveProperty("slug");
    expect(snapshot).not.toHaveProperty("agentes");
  });

  it("un campo fuera de la foto no aparece en el diff aunque cambie", () => {
    const before = pickSnapshot({ name: "Soporte", slug: "soporte" }, ["name"]);
    const after = pickSnapshot({ name: "Soporte", slug: "mesa-de-ayuda" }, ["name"]);

    expect(computeDiff(before, after)).toBeNull();
  });
});
