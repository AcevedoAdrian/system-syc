import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { normalizeName } from "./common/text";

// Lectura de los archivos de `seed-data/` (en la raíz del repo). Son datos, no código: el bundle del
// seed no los incluye, así que algunos (áreas y agentes) pueden no estar en git y copiarse aparte.

const nombres = z.array(z.string().trim().min(1).max(120)).min(1);

export const departamentosSchema = nombres;
export const prioridadesSchema = nombres;
export const edificiosSchema = nombres;
export const tiposAreaSchema = nombres;
// SPEC 12: cada tipo de ticket trae una descripción opcional, de hasta 500 como en el catálogo.
export const tiposTicketSchema = z
  .array(
    z.object({
      nombre: z.string().trim().min(1).max(120),
      descripcion: z.string().trim().max(500).optional(),
    }),
  )
  .min(1);
// Cada área nombra su tipo (SPEC 08); el tipo tiene que existir en `tipos-area.json` o en la base.
export const areasSchema = z
  .array(
    z.object({
      tipo: z.string().trim().min(1).max(120),
      nombre: z.string().trim().min(1).max(120),
    }),
  )
  .min(1);
// Cada módulo nombra los departamentos a los que pertenece (SPEC 11). La lista vacía no se rechaza acá:
// `resolveSeedModulos` la rechaza nombrando el módulo, que un mensaje de Zod con un índice no hace.
export const modulosSchema = z
  .array(
    z.object({
      nombre: z.string().trim().min(1).max(120),
      departamentos: z.array(z.string().trim().min(1).max(120)),
    }),
  )
  .min(1);
export const estadosSchema = z
  .array(z.object({ nombre: z.string().trim().min(1).max(120), clave: z.string().optional() }))
  .min(1);
export const agentesSchema = z
  .array(
    z.object({
      nombre: z.string().trim().min(1).max(100),
      apellido: z.string().trim().min(1).max(100),
      departamento: z.string().trim().min(1),
    }),
  )
  .min(1);

export type SeedAgent = z.infer<typeof agentesSchema>[number];
export type SeedArea = z.infer<typeof areasSchema>[number];
export type SeedModulo = z.infer<typeof modulosSchema>[number];
export type SeedTipoTicket = z.infer<typeof tiposTicketSchema>[number];

// Aborta antes de crear nada, nombrando los valores, si dos tipos de ticket comparten nombre
// normalizado (el índice único rechazaría el segundo a mitad de la carga). Una descripción en blanco
// se descarta: el tipo queda sin descripción.
export function resolveSeedTiposTicket(
  tipos: readonly SeedTipoTicket[],
): { nombre: string; descripcion?: string }[] {
  const seen = new Set<string>();
  const repeated: string[] = [];
  for (const tipo of tipos) {
    const key = normalizeName(tipo.nombre);
    if (seen.has(key)) repeated.push(`"${tipo.nombre}"`);
    seen.add(key);
  }
  if (repeated.length > 0) {
    throw new Error(`tipos-ticket.json repite tipos de ticket: ${repeated.join(", ")}`);
  }

  return tipos.map((tipo) => ({
    nombre: tipo.nombre,
    ...(tipo.descripcion ? { descripcion: tipo.descripcion } : {}),
  }));
}

// Resuelve el `tipo` de cada área contra los tipos que ya están en la base. Aborta antes de crear
// nada si algún tipo no existe o si dos áreas comparten nombre normalizado dentro de un mismo tipo
// (el índice único las rechazaría a mitad de la carga), nombrando los valores.
export function resolveSeedAreas(
  areas: readonly SeedArea[],
  tipos: readonly { id: string; nombre: string }[],
): { nombre: string; tipo: { id: string; nombre: string } }[] {
  const byName = new Map(tipos.map((tipo) => [normalizeName(tipo.nombre), tipo]));

  const missing = [
    ...new Set(areas.filter((a) => !byName.has(normalizeName(a.tipo))).map((a) => a.tipo)),
  ];
  if (missing.length > 0) {
    throw new Error(
      `areas.json pide tipos de área que no existen: ${missing.map((m) => `"${m}"`).join(", ")}`,
    );
  }

  const seen = new Set<string>();
  const repeated: string[] = [];
  for (const area of areas) {
    const key = `${normalizeName(area.tipo)}|${normalizeName(area.nombre)}`;
    if (seen.has(key)) repeated.push(`"${area.nombre}" en "${area.tipo}"`);
    seen.add(key);
  }
  if (repeated.length > 0) {
    throw new Error(`areas.json repite áreas dentro de un mismo tipo: ${repeated.join(", ")}`);
  }

  return areas.map((area) => ({
    nombre: area.nombre,
    tipo: byName.get(normalizeName(area.tipo)) as { id: string; nombre: string },
  }));
}

// Resuelve los departamentos de cada módulo contra los que ya están en la base. Aborta antes de crear
// nada, nombrando los valores, si un módulo trae la lista vacía, si algún departamento no existe o si
// dos módulos comparten nombre normalizado (el índice único rechazaría el segundo a mitad de la
// carga). Un departamento repetido dentro de un módulo cuenta una sola vez.
export function resolveSeedModulos(
  modulos: readonly SeedModulo[],
  departamentos: readonly { id: string; nombre: string }[],
): { nombre: string; departamentos: { id: string; nombre: string }[] }[] {
  const byName = new Map(departamentos.map((dep) => [normalizeName(dep.nombre), dep]));

  const empty = modulos.filter((m) => m.departamentos.length === 0).map((m) => `"${m.nombre}"`);
  if (empty.length > 0) {
    throw new Error(`modulos.json trae módulos sin departamentos: ${empty.join(", ")}`);
  }

  const missing = [
    ...new Set(
      modulos.flatMap((m) => m.departamentos).filter((name) => !byName.has(normalizeName(name))),
    ),
  ];
  if (missing.length > 0) {
    throw new Error(
      `modulos.json pide departamentos que no existen: ${missing.map((m) => `"${m}"`).join(", ")}`,
    );
  }

  const seen = new Set<string>();
  const repeated: string[] = [];
  for (const modulo of modulos) {
    const key = normalizeName(modulo.nombre);
    if (seen.has(key)) repeated.push(`"${modulo.nombre}"`);
    seen.add(key);
  }
  if (repeated.length > 0) {
    throw new Error(`modulos.json repite módulos: ${repeated.join(", ")}`);
  }

  return modulos.map((modulo) => ({
    nombre: modulo.nombre,
    departamentos: [
      ...new Map(
        modulo.departamentos.map((name) => {
          const dep = byName.get(normalizeName(name)) as { id: string; nombre: string };
          return [dep.id, dep] as const;
        }),
      ).values(),
    ],
  }));
}

// `SEED_DATA_DIR` si está definida (producción: `/seed-data`); si no, la primera carpeta `seed-data`
// que haya subiendo desde el directorio actual (`apps/api` con `pnpm seed`, la raíz con `pnpm verify`).
export function findSeedDataDir(cwd = process.cwd(), override = process.env.SEED_DATA_DIR): string {
  if (override) return path.resolve(override);
  let dir = path.resolve(cwd);
  for (;;) {
    const candidate = path.join(dir, "seed-data");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("No encuentro la carpeta seed-data (ver SEED_DATA_DIR)");
    dir = parent;
  }
}

// `null` si el archivo no existe; si existe y está mal, falla nombrando el archivo.
export function readSeedFile<T>(dir: string, file: string, schema: z.ZodType<T>): T | null {
  const full = path.join(dir, file);
  if (!existsSync(full)) return null;
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(full, "utf8"));
  } catch {
    throw new Error(`seed-data/${file} no es un JSON válido`);
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(raíz)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`seed-data/${file} es inválido:\n${problems}`);
  }
  return result.data;
}

export function requireSeedFile<T>(dir: string, file: string, schema: z.ZodType<T>): T {
  const data = readSeedFile(dir, file, schema);
  if (!data) throw new Error(`Falta seed-data/${file} (en ${dir})`);
  return data;
}

// "Francisco Javier" + "Fariña" → "ffarina": primera letra del nombre y apellido, en minúsculas y
// sin acentos ni espacios (el usuario solo admite letras, números, "_" y ".").
export function seedUsername(agent: Pick<SeedAgent, "nombre" | "apellido">): string {
  const plain = (value: string) =>
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  return plain(agent.nombre.trim().charAt(0)) + plain(agent.apellido);
}
