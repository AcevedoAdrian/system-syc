import { z } from "zod";
import { normalizeName, uniqueSlug } from "./common/text";
import { loadEnv } from "./config/env.schema";
import { AuditRepository } from "./modules/audit/audit.repository";
import { AuditService } from "./modules/audit/audit.service";
import { type Auth, createAuth } from "./modules/auth/auth.config";
import { CATALOG_DEFINITIONS } from "./modules/catalogs/catalog-definitions";
import { CatalogsRepository } from "./modules/catalogs/catalogs.repository";
import { CatalogsService } from "./modules/catalogs/catalogs.service";
import { TicketsRepository } from "./modules/tickets/tickets.repository";
import { toInternalEmail } from "./modules/users/internal-email";
import { userAuditSnapshot } from "./modules/users/user-audit-snapshot";

const DEFAULT_DEPARTMENTS = ["Administrativo", "Técnico", "Redes", "Desarrollo"];

// Catálogos con datos iniciales (SPEC 04, Feature 4.5), en el orden en que se cargan. `clave` es la
// de los 4 estados de sistema (D1). Los otros 5 catálogos los carga el admin.
const DEFAULT_ESTADOS = [
  { nombre: "Pendiente" },
  { nombre: "En progreso" },
  { nombre: "En espera" },
  { nombre: "Finalizado", clave: "FINALIZADO" },
  { nombre: "Cerrado", clave: "CERRADO" },
  { nombre: "Cancelado", clave: "CANCELADO" },
  { nombre: "Reabierto", clave: "REABIERTO" },
];
const DEFAULT_PRIORIDADES = [
  { nombre: "Baja" },
  { nombre: "Media" },
  { nombre: "Alta" },
  { nombre: "Urgente" },
];

// Variables propias del seed: no son obligatorias para arrancar la API (por eso no están en `env.schema.ts`).
const seedEnvSchema = z.object({
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
    throw new Error(`Faltan o son inválidas las variables del admin raíz del seed:\n${problems}`);
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

async function seedDepartments(auth: Auth, audit: AuditService): Promise<{ creados: string[] }> {
  const ctx = await auth.$context;
  const rows = await ctx.adapter.findMany<OrganizationRow>({ model: "organization" });
  const names = new Set(rows.map((row) => normalizeName(row.name)));
  const slugs = new Set(rows.map((row) => row.slug));
  const creados: string[] = [];

  for (const name of DEFAULT_DEPARTMENTS) {
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
// no deshace un renombre del admin.
async function seedCatalogs(
  catalogs: CatalogsService,
  adminId: string,
): Promise<{ estados: number; prioridades: number }> {
  return {
    estados: await catalogs.seedIfEmpty(CATALOG_DEFINITIONS.estados, DEFAULT_ESTADOS, adminId),
    prioridades: await catalogs.seedIfEmpty(
      CATALOG_DEFINITIONS.prioridades,
      DEFAULT_PRIORIDADES,
      adminId,
    ),
  };
}

async function main() {
  const seedEnv = loadSeedEnv(process.env);
  const env = loadEnv(process.env);
  const auth = createAuth(env);
  const audit = new AuditService(new AuditRepository(env));

  const admin = await seedAdmin(auth, audit, seedEnv);
  const departments = await seedDepartments(auth, audit);
  const catalogs = await seedCatalogs(
    new CatalogsService(new CatalogsRepository(env), audit, new TicketsRepository(env)),
    await findAdminId(auth, seedEnv.SEED_ADMIN_USERNAME),
  );

  console.log(`Admin raíz "${seedEnv.SEED_ADMIN_USERNAME}": ${admin}.`);
  console.log(
    departments.creados.length > 0
      ? `Departamentos creados: ${departments.creados.join(", ")}.`
      : "Departamentos: ya existían los 4.",
  );
  console.log(
    catalogs.estados > 0
      ? `Estados creados: ${catalogs.estados}.`
      : "Estados: la tabla ya tenía datos, no se tocó.",
  );
  console.log(
    catalogs.prioridades > 0
      ? `Prioridades creadas: ${catalogs.prioridades}.`
      : "Prioridades: la tabla ya tenía datos, no se tocó.",
  );
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
