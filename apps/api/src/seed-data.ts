import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

// Lectura de los archivos de `seed-data/` (en la raíz del repo). Son datos, no código: el bundle del
// seed no los incluye, así que algunos (áreas y agentes) pueden no estar en git y copiarse aparte.

const nombres = z.array(z.string().trim().min(1).max(120)).min(1);

export const departamentosSchema = nombres;
export const prioridadesSchema = nombres;
export const edificiosSchema = nombres;
export const areasSchema = nombres;
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
