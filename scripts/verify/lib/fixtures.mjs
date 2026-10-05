import { randomBytes } from "node:crypto";
import { Client } from "./client.mjs";
import { ADMIN, AGENT_PASSWORD } from "./env.mjs";
import { assert, assertStatus } from "./util.mjs";

// Fixtures de datos reutilizables por cualquier SPEC: cada criterio crea los suyos con nombres únicos,
// así los criterios no dependen del orden en que corren.

export const uniq = () => randomBytes(3).toString("hex");

let adminClient = null;

// Cliente con la sesión del admin raíz del seed (se loguea una sola vez).
export async function admin() {
  if (!adminClient) {
    adminClient = new Client();
    assertStatus(
      await adminClient.login(ADMIN.username, ADMIN.password),
      200,
      "login del admin raíz",
    );
  }
  return adminClient;
}

export async function departments() {
  const res = await (await admin()).get("/organizations");
  assertStatus(res, 200, "organizations.list");
  return res.body;
}

export async function departmentNamed(nombre) {
  const found = (await departments()).find((d) => d.nombre === nombre);
  assert(found, `no existe el departamento "${nombre}" (¿corrió el seed?)`);
  return found;
}

export async function newDepartment(prefix = "Depto") {
  const res = await (await admin()).post("/organizations", { nombre: `${prefix} ${uniq()}` });
  assertStatus(res, 200, "crear departamento");
  return res.body;
}

// Crea un usuario por la API. Un agente sin `organizationId` queda en "Técnico".
export async function newUser({ role = "agente", organizationId, email } = {}) {
  const username = `u${uniq()}`;
  const dept =
    role === "agente" ? (organizationId ?? (await departmentNamed("Técnico")).id) : undefined;
  const body = {
    username,
    name: `Usuario ${username}`,
    password: AGENT_PASSWORD,
    role,
    organizationId: dept,
  };
  if (email) body.email = email;
  const res = await (await admin()).post("/users", body);
  assertStatus(res, 200, `crear ${role}`);
  return { ...res.body, password: AGENT_PASSWORD };
}

// Cliente con la sesión de `user` (necesita `username` y `password`).
export async function loggedIn(user) {
  const client = new Client();
  assertStatus(await client.login(user.username, user.password), 200, `login de ${user.username}`);
  return client;
}
