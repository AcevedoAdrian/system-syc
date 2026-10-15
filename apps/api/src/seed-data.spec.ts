import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  areasSchema,
  estadosSchema,
  findSeedDataDir,
  prioridadesSchema,
  readSeedFile,
  requireSeedFile,
  resolveSeedAreas,
  seedUsername,
  tiposAreaSchema,
} from "./seed-data";

function tmp(): string {
  return mkdtempSync(path.join(tmpdir(), "seed-data-"));
}

describe("seedUsername", () => {
  it("usa la primera letra del nombre y el apellido, sin acentos ni espacios", () => {
    expect(seedUsername({ nombre: "Francisco Javier", apellido: "Fariña" })).toBe("ffarina");
    expect(seedUsername({ nombre: " José Ignacio ", apellido: "Navarrete" })).toBe("jnavarrete");
    expect(seedUsername({ nombre: "Ana", apellido: "De la Cruz" })).toBe("adelacruz");
  });
});

describe("readSeedFile", () => {
  it("devuelve null si el archivo no existe", () => {
    expect(readSeedFile(tmp(), "areas.json", areasSchema)).toBeNull();
  });

  it("lee y valida el archivo", () => {
    const dir = tmp();
    writeFileSync(
      path.join(dir, "areas.json"),
      JSON.stringify([{ tipo: " Dirección ", nombre: " Logística " }]),
    );
    expect(readSeedFile(dir, "areas.json", areasSchema)).toEqual([
      { tipo: "Dirección", nombre: "Logística" },
    ]);
  });

  it("nombra el archivo si es inválido", () => {
    const dir = tmp();
    writeFileSync(path.join(dir, "areas.json"), "[]");
    expect(() => readSeedFile(dir, "areas.json", areasSchema)).toThrow(/seed-data\/areas\.json/);
    writeFileSync(path.join(dir, "areas.json"), "{");
    expect(() => readSeedFile(dir, "areas.json", areasSchema)).toThrow(/no es un JSON válido/);
  });

  it("rechaza un área sin tipo (el formato viejo, un texto por área)", () => {
    const dir = tmp();
    writeFileSync(path.join(dir, "areas.json"), JSON.stringify(["Dir. A"]));
    expect(() => readSeedFile(dir, "areas.json", areasSchema)).toThrow(/seed-data\/areas\.json/);
    writeFileSync(path.join(dir, "areas.json"), JSON.stringify([{ nombre: "A" }]));
    expect(() => readSeedFile(dir, "areas.json", areasSchema)).toThrow(/tipo/);
  });

  it("lee tipos-area.json como una lista de nombres", () => {
    const dir = tmp();
    writeFileSync(path.join(dir, "tipos-area.json"), JSON.stringify([" Diputado ", "Otro"]));
    expect(readSeedFile(dir, "tipos-area.json", tiposAreaSchema)).toEqual(["Diputado", "Otro"]);
  });

  it("requireSeedFile falla si falta", () => {
    expect(() => requireSeedFile(tmp(), "estados.json", areasSchema)).toThrow(/Falta seed-data/);
  });
});

describe("estados.json y prioridades.json con color (SPEC 10)", () => {
  function conArchivo(file: string, contenido: unknown) {
    const dir = tmp();
    writeFileSync(path.join(dir, file), JSON.stringify(contenido));
    return dir;
  }

  it("lee el color de cada estado y conserva la clave", () => {
    const dir = conArchivo("estados.json", [
      { nombre: "Pendiente", color: "azul" },
      { nombre: "Finalizado", clave: "FINALIZADO", color: "verde" },
    ]);

    expect(readSeedFile(dir, "estados.json", estadosSchema)).toEqual([
      { nombre: "Pendiente", color: "azul" },
      { nombre: "Finalizado", clave: "FINALIZADO", color: "verde" },
    ]);
  });

  it("un estado sin color se carga en gris", () => {
    const dir = conArchivo("estados.json", [{ nombre: "Pendiente" }]);

    expect(readSeedFile(dir, "estados.json", estadosSchema)).toEqual([
      { nombre: "Pendiente", color: "gris" },
    ]);
  });

  it("un color inválido aborta nombrando el archivo, el valor y el ítem", () => {
    const dir = conArchivo("estados.json", [
      { nombre: "Pendiente", color: "azul" },
      { nombre: "En espera", color: "fucsia" },
    ]);

    const leer = () => readSeedFile(dir, "estados.json", estadosSchema);
    expect(leer).toThrow(/seed-data\/estados\.json/);
    expect(leer).toThrow(/«fucsia»/);
    expect(leer).toThrow(/«En espera»/);
  });

  it("las prioridades aceptan el objeto con color", () => {
    const dir = conArchivo("prioridades.json", [
      { nombre: "Baja", color: "gris" },
      { nombre: "Urgente", color: "rojo" },
    ]);

    expect(readSeedFile(dir, "prioridades.json", prioridadesSchema)).toEqual([
      { nombre: "Baja", color: "gris" },
      { nombre: "Urgente", color: "rojo" },
    ]);
  });

  it("las prioridades aceptan un texto suelto (el formato anterior) y lo cargan en gris", () => {
    const dir = conArchivo("prioridades.json", ["Baja", { nombre: "Alta", color: "naranja" }]);

    expect(readSeedFile(dir, "prioridades.json", prioridadesSchema)).toEqual([
      { nombre: "Baja", color: "gris" },
      { nombre: "Alta", color: "naranja" },
    ]);
  });

  it("una prioridad con un color inválido aborta nombrando el archivo y el ítem", () => {
    const dir = conArchivo("prioridades.json", [{ nombre: "Urgente", color: "Rojo" }]);

    const leer = () => readSeedFile(dir, "prioridades.json", prioridadesSchema);
    expect(leer).toThrow(/seed-data\/prioridades\.json/);
    expect(leer).toThrow(/«Rojo»/);
    expect(leer).toThrow(/«Urgente»/);
  });

  it("rechaza una prioridad sin nombre", () => {
    const dir = conArchivo("prioridades.json", [{ color: "rojo" }]);

    expect(() => readSeedFile(dir, "prioridades.json", prioridadesSchema)).toThrow(/nombre/);
  });

  it("los archivos del repositorio son válidos y traen la propuesta del SPEC 10", () => {
    const dir = findSeedDataDir(process.cwd(), undefined);

    const estados = readSeedFile(dir, "estados.json", estadosSchema) ?? [];
    const prioridades = readSeedFile(dir, "prioridades.json", prioridadesSchema) ?? [];

    expect(estados.map((e) => [e.nombre, e.color])).toEqual([
      ["Pendiente", "azul"],
      ["En progreso", "violeta"],
      ["En espera", "amarillo"],
      ["Finalizado", "verde"],
      ["Cerrado", "gris"],
      ["Cancelado", "rojo"],
      ["Reabierto", "naranja"],
    ]);
    expect(prioridades.map((p) => [p.nombre, p.color])).toEqual([
      ["Baja", "gris"],
      ["Media", "azul"],
      ["Alta", "naranja"],
      ["Urgente", "rojo"],
    ]);
  });
});

describe("resolveSeedAreas", () => {
  const tipos = [
    { id: "t1", nombre: "Diputado" },
    { id: "t2", nombre: "Dirección" },
  ];

  it("asigna a cada área su tipo, sin importar mayúsculas ni acentos", () => {
    expect(
      resolveSeedAreas(
        [
          { tipo: "diputado", nombre: "Acosta" },
          { tipo: "DIRECCION", nombre: "Logística" },
        ],
        tipos,
      ),
    ).toEqual([
      { nombre: "Acosta", tipo: tipos[0] },
      { nombre: "Logística", tipo: tipos[1] },
    ]);
  });

  it("aborta nombrando los tipos que no existen, una sola vez cada uno", () => {
    expect(() =>
      resolveSeedAreas(
        [
          { tipo: "Comisión", nombre: "A" },
          { tipo: "Comisión", nombre: "B" },
          { tipo: "Oficina", nombre: "C" },
        ],
        tipos,
      ),
    ).toThrow('areas.json pide tipos de área que no existen: "Comisión", "Oficina"');
  });

  it("aborta si hay dos áreas con el mismo nombre normalizado dentro de un tipo", () => {
    expect(() =>
      resolveSeedAreas(
        [
          { tipo: "Diputado", nombre: "Gonzalez" },
          { tipo: "Diputado", nombre: "gonzález" },
        ],
        tipos,
      ),
    ).toThrow('"gonzález" en "Diputado"');
  });

  it("el mismo nombre en dos tipos distintos es válido", () => {
    expect(
      resolveSeedAreas(
        [
          { tipo: "Diputado", nombre: "Gonzalez" },
          { tipo: "Dirección", nombre: "Gonzalez" },
        ],
        tipos,
      ),
    ).toHaveLength(2);
  });
});

describe("findSeedDataDir", () => {
  it("usa SEED_DATA_DIR si está definida", () => {
    expect(findSeedDataDir("/x", "/datos")).toBe("/datos");
  });

  it("sube desde el directorio actual hasta encontrar seed-data", () => {
    const root = tmp();
    mkdirSync(path.join(root, "seed-data"));
    mkdirSync(path.join(root, "apps", "api"), { recursive: true });
    expect(findSeedDataDir(path.join(root, "apps", "api"), undefined)).toBe(
      path.join(root, "seed-data"),
    );
  });
});
