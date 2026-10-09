import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  areasSchema,
  findSeedDataDir,
  readSeedFile,
  requireSeedFile,
  seedUsername,
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
    writeFileSync(path.join(dir, "areas.json"), JSON.stringify([" Dir. A "]));
    expect(readSeedFile(dir, "areas.json", areasSchema)).toEqual(["Dir. A"]);
  });

  it("nombra el archivo si es inválido", () => {
    const dir = tmp();
    writeFileSync(path.join(dir, "areas.json"), "[]");
    expect(() => readSeedFile(dir, "areas.json", areasSchema)).toThrow(/seed-data\/areas\.json/);
    writeFileSync(path.join(dir, "areas.json"), "{");
    expect(() => readSeedFile(dir, "areas.json", areasSchema)).toThrow(/no es un JSON válido/);
  });

  it("requireSeedFile falla si falta", () => {
    expect(() => requireSeedFile(tmp(), "estados.json", areasSchema)).toThrow(/Falta seed-data/);
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
