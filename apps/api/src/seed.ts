import { z } from "zod";
import { normalizeName, uniqueSlug } from "./common/text";
import { loadEnv } from "./config/env.schema";
import { type Auth, createAuth } from "./modules/auth/auth.config";
import { toInternalEmail } from "./modules/users/internal-email";

const DEFAULT_DEPARTMENTS = ["Administrativo", "Técnico", "Redes", "Desarrollo"];

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

async function seedAdmin(auth: Auth, seedEnv: SeedEnv): Promise<"creado" | "existente"> {
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
  return "creado";
}

async function seedDepartments(auth: Auth): Promise<{ creados: string[] }> {
  const ctx = await auth.$context;
  const rows = await ctx.adapter.findMany<OrganizationRow>({ model: "organization" });
  const names = new Set(rows.map((row) => normalizeName(row.name)));
  const slugs = new Set(rows.map((row) => row.slug));
  const creados: string[] = [];

  for (const name of DEFAULT_DEPARTMENTS) {
    if (names.has(normalizeName(name))) continue;
    const slug = uniqueSlug(name, slugs);
    await ctx.adapter.create({
      model: "organization",
      data: { name, slug, createdAt: new Date(), activo: true },
    });
    names.add(normalizeName(name));
    slugs.add(slug);
    creados.push(name);
  }
  return { creados };
}

async function main() {
  const seedEnv = loadSeedEnv(process.env);
  const auth = createAuth(loadEnv(process.env));

  const admin = await seedAdmin(auth, seedEnv);
  const departments = await seedDepartments(auth);

  console.log(`Admin raíz "${seedEnv.SEED_ADMIN_USERNAME}": ${admin}.`);
  console.log(
    departments.creados.length > 0
      ? `Departamentos creados: ${departments.creados.join(", ")}.`
      : "Departamentos: ya existían los 4.",
  );
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
