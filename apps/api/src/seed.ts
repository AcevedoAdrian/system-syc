import { z } from "zod";
import { normalizeName, uniqueSlug } from "./common/text";
import { loadEnv } from "./config/env.schema";
import { AuditRepository } from "./modules/audit/audit.repository";
import { AuditService } from "./modules/audit/audit.service";
import { type Auth, createAuth } from "./modules/auth/auth.config";
import {
  CATALOG_DEFINITIONS,
  type CatalogDefinition,
} from "./modules/catalogs/catalog-definitions";
import { CatalogsRepository } from "./modules/catalogs/catalogs.repository";
import { CatalogsService } from "./modules/catalogs/catalogs.service";
import { TicketsRepository } from "./modules/tickets/tickets.repository";
import { toInternalEmail } from "./modules/users/internal-email";
import { userAuditSnapshot } from "./modules/users/user-audit-snapshot";
import {
  agentesSchema,
  areasSchema,
  departamentosSchema,
  edificiosSchema,
  estadosSchema,
  findSeedDataDir,
  prioridadesSchema,
  readSeedFile,
  requireSeedFile,
  type SeedAgent,
  seedUsername,
} from "./seed-data";

// Los datos iniciales (departamentos, estados, prioridades, edificios, áreas y agentes) son archivos
// de `seed-data/`, no constantes: ver `seed-data/README.md`.
interface SeedData {
  departamentos: string[];
  estados: { nombre: string; clave?: string | undefined }[];
  prioridades: { nombre: string }[];
  edificios: { nombre: string }[] | null;
  areas: { nombre: string }[] | null;
  agentes: SeedAgent[] | null;
}

const toItems = (names: string[] | null) => names?.map((nombre) => ({ nombre })) ?? null;

// Departamentos, estados y prioridades son obligatorios (el sistema no anda sin ellos); edificios,
// áreas y agentes se saltean si no están (áreas y agentes no van a git).
function loadSeedData(dir: string): SeedData {
  return {
    departamentos: requireSeedFile(dir, "departamentos.json", departamentosSchema),
    estados: requireSeedFile(dir, "estados.json", estadosSchema),
    prioridades: toItems(requireSeedFile(dir, "prioridades.json", prioridadesSchema)) ?? [],
    edificios: toItems(readSeedFile(dir, "edificios.json", edificiosSchema)),
    areas: toItems(readSeedFile(dir, "areas.json", areasSchema)),
    agentes: readSeedFile(dir, "agentes.json", agentesSchema),
  };
}

// Variables propias del seed: no son obligatorias para arrancar la API (por eso no están en `env.schema.ts`).
// `SEED_AGENTS_PASSWORD` es la contraseña inicial de los agentes; sin ella el seed no los carga.
const seedEnvSchema = z.object({
  SEED_AGENTS_PASSWORD: z
    .string()
    .min(8)
    .max(128)
    .optional()
    .or(z.literal("").transform(() => undefined)), // docker-compose pasa la ausente como ""
  SEED_ADMIN_USERNAME: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9_.]+$/i),
  SEED_ADMIN_PASSWORD: z.string().min(8).max(128),
  SEED_ADMIN_NAME: z.string().trim().min(1).max(120),
});

type SeedEnv = z.infer<typeof seedEnvSchema>;

function loadSeedEnv(raw: NodeJS.ProcessEnv): SeedEnv {
  const result = seedEnvSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Faltan o son inválidas las variables del seed:\n${problems}`);
  }
  return result.data;
}

interface OrganizationRow {
  name: string;
  slug: string;
}

// Lo que crea el seed queda como `create` con `actorId: null` (null = sistema). Si no crea nada,
// no deja registros.
async function seedAdmin(
  auth: Auth,
  audit: AuditService,
  seedEnv: SeedEnv,
): Promise<"creado" | "existente"> {
  const ctx = await auth.$context;
  const username = seedEnv.SEED_ADMIN_USERNAME.toLowerCase();

  const existing = await ctx.adapter.findOne({
    model: "user",
    where: [{ field: "username", value: username }],
  });
  if (existing) return "existente";

  // No hay sesión: se crea por el contexto interno, con el mismo hash de contraseña que usa el login.
  const user = await ctx.internalAdapter.createUser(
    {
      name: seedEnv.SEED_ADMIN_NAME,
      email: toInternalEmail(username),
      emailVerified: false,
      username,
      role: "admin",
    },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(seedEnv.SEED_ADMIN_PASSWORD),
  });
  await audit.log({
    entityType: "User",
    entityId: user.id,
    action: "create",
    actorId: null,
    payload: {
      after: userAuditSnapshot({
        id: user.id,
        username,
        name: seedEnv.SEED_ADMIN_NAME,
        email: null, // el email del seed es el interno
        role: "admin",
        activo: true,
        department: null,
      }),
    },
  });
  return "creado";
}

async function seedDepartments(
  auth: Auth,
  audit: AuditService,
  departamentos: readonly string[],
): Promise<{ creados: string[] }> {
  const ctx = await auth.$context;
  const rows = await ctx.adapter.findMany<OrganizationRow>({ model: "organization" });
  const names = new Set(rows.map((row) => normalizeName(row.name)));
  const slugs = new Set(rows.map((row) => row.slug));
  const creados: string[] = [];

  for (const name of departamentos) {
    if (names.has(normalizeName(name))) continue;
    const slug = uniqueSlug(name, slugs);
    const created = await ctx.adapter.create<{ id: string }>({
      model: "organization",
      data: { name, slug, createdAt: new Date(), activo: true },
    });
    await audit.log({
      entityType: "Organization",
      entityId: created.id,
      action: "create",
      actorId: null,
      payload: { after: { nombre: name, activo: true } },
    });
    names.add(normalizeName(name));
    slugs.add(slug);
    creados.push(name);
  }
  return { creados };
}

// `createdBy` es una FK obligatoria: las filas del seed quedan a nombre del admin raíz, aunque su
// `AuditLog` tenga `actorId: null`.
async function findAdminId(auth: Auth, username: string): Promise<string> {
  const ctx = await auth.$context;
  const admin = await ctx.adapter.findOne<{ id: string }>({
    model: "user",
    where: [{ field: "username", value: username.toLowerCase() }],
  });
  if (!admin) throw new Error(`No encuentro al admin raíz "${username}" para cargar los catálogos`);
  return admin.id;
}

// Cada catálogo se carga solo si su tabla no tiene ninguna fila; correrlo otra vez no crea nada y
// no deshace un renombre del admin. `null` = no había archivo, no se intentó.
async function seedCatalogs(
  catalogs: CatalogsService,
  data: SeedData,
  adminId: string,
): Promise<{
  estados: number;
  prioridades: number;
  areas: number | null;
  edificios: number | null;
}> {
  const load = async (def: CatalogDefinition, items: { nombre: string }[] | null) =>
    items ? await catalogs.seedIfEmpty(def, items, adminId) : null;
  return {
    estados: await catalogs.seedIfEmpty(CATALOG_DEFINITIONS.estados, data.estados, adminId),
    prioridades: await catalogs.seedIfEmpty(
      CATALOG_DEFINITIONS.prioridades,
      data.prioridades,
      adminId,
    ),
    areas: await load(CATALOG_DEFINITIONS.areas, data.areas),
    edificios: await load(CATALOG_DEFINITIONS.edificios, data.edificios),
  };
}

// Los agentes se crean como `seedAdmin` crea al admin (sin sesión, por el contexto interno de Better
// Auth) y con su `Member` en el departamento. Uno cuyo usuario ya existe se saltea: no se le cambia la
// contraseña ni el departamento. Un departamento inexistente aborta antes de crear a nadie.
async function seedAgents(
  auth: Auth,
  audit: AuditService,
  agentes: readonly SeedAgent[],
  password: string,
): Promise<{ creados: string[]; existentes: number }> {
  const ctx = await auth.$context;
  const departments = await ctx.adapter.findMany<OrganizationRow & { id: string }>({
    model: "organization",
  });
  const byName = new Map(departments.map((row) => [normalizeName(row.name), row]));

  const pendientes = agentes.map((agent) => {
    const department = byName.get(normalizeName(agent.departamento));
    if (!department) {
      throw new Error(
        `El agente ${agent.nombre} ${agent.apellido} pide el departamento "${agent.departamento}", que no existe`,
      );
    }
    return { agent, department, username: seedUsername(agent) };
  });

  const creados: string[] = [];
  let existentes = 0;
  const hash = await ctx.password.hash(password);
  for (const { agent, department, username } of pendientes) {
    const found = await ctx.adapter.findOne({
      model: "user",
      where: [{ field: "username", value: username }],
    });
    if (found) {
      existentes += 1;
      continue;
    }
    const name = `${agent.nombre.trim()} ${agent.apellido.trim()}`;
    const user = await ctx.internalAdapter.createUser(
      {
        name,
        email: toInternalEmail(username),
        emailVerified: false,
        username,
        role: "agente",
      },
      { method: "admin" },
    );
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: hash,
    });
    await ctx.adapter.create({
      model: "member",
      data: {
        organizationId: department.id,
        userId: user.id,
        role: "agente",
        createdAt: new Date(),
      },
    });
    await audit.log({
      entityType: "User",
      entityId: user.id,
      action: "create",
      actorId: null,
      payload: {
        after: userAuditSnapshot({
          id: user.id,
          username,
          name,
          email: null, // el email del seed es el interno
          role: "agente",
          activo: true,
          department: { id: department.id, nombre: department.name },
        }),
      },
    });
    creados.push(username);
  }
  return { creados, existentes };
}

async function main() {
  const seedEnv = loadSeedEnv(process.env);
  const dir = findSeedDataDir();
  const data = loadSeedData(dir);
  const env = loadEnv(process.env);
  const auth = createAuth(env);
  const audit = new AuditService(new AuditRepository(env));

  const admin = await seedAdmin(auth, audit, seedEnv);
  const departments = await seedDepartments(auth, audit, data.departamentos);
  const catalogs = await seedCatalogs(
    new CatalogsService(new CatalogsRepository(env), audit, new TicketsRepository(env)),
    data,
    await findAdminId(auth, seedEnv.SEED_ADMIN_USERNAME),
  );
  const agents =
    data.agentes && seedEnv.SEED_AGENTS_PASSWORD
      ? await seedAgents(auth, audit, data.agentes, seedEnv.SEED_AGENTS_PASSWORD)
      : null;

  const report = (label: string, verb: string, created: number | null, file: string) => {
    if (created === null) console.log(`${label}: no hay seed-data/${file}, no se cargaron.`);
    else if (created > 0) console.log(`${label} ${verb}: ${created}.`);
    else console.log(`${label}: la tabla ya tenía datos, no se tocó.`);
  };

  console.log(`Datos del seed: ${dir}`);
  console.log(`Admin raíz "${seedEnv.SEED_ADMIN_USERNAME}": ${admin}.`);
  console.log(
    departments.creados.length > 0
      ? `Departamentos creados: ${departments.creados.join(", ")}.`
      : `Departamentos: ya existían los ${data.departamentos.length}.`,
  );
  report("Estados", "creados", catalogs.estados, "estados.json");
  report("Prioridades", "creadas", catalogs.prioridades, "prioridades.json");
  report("Áreas", "creadas", catalogs.areas, "areas.json");
  report("Edificios", "creados", catalogs.edificios, "edificios.json");
  if (!data.agentes) console.log("Agentes: no hay seed-data/agentes.json, no se cargaron.");
  else if (!agents) console.log("Agentes: no se cargaron (falta SEED_AGENTS_PASSWORD).");
  else {
    console.log(
      agents.creados.length > 0
        ? `Agentes creados: ${agents.creados.join(", ")}.`
        : "Agentes: ya existían todos.",
    );
  }
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
