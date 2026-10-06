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

let prioridadId = null;

// Id de una prioridad activa del seed (la misma para todos los fixtures de tickets).
export async function firstPrioridadId() {
  if (!prioridadId) {
    const res = await (await admin()).get("/catalogs/prioridades");
    assertStatus(res, 200, "catalogs.prioridades.list");
    const activa = res.body.find((p) => p.activo);
    assert(activa, "no hay ninguna prioridad activa (¿corrió el seed?)");
    prioridadId = activa.id;
  }
  return prioridadId;
}

// Cuerpo de un alta de ticket válido en `departamentoId`; `extra` pisa o suma campos.
export async function ticketBody(departamentoId, extra = {}) {
  return {
    departamentoId,
    titulo: `Ticket ${uniq()}`,
    prioridadId: await firstPrioridadId(),
    fechaRecepcion: "2020-01-01", // fija y pasada: nunca cae en el futuro de Argentina
    ...extra,
  };
}

// Crea un ticket por la API con la sesión de `client` (el admin, o un agente en su departamento).
export async function newTicket(client, departamentoId, extra = {}) {
  const res = await client.post("/tickets", await ticketBody(departamentoId, extra));
  assertStatus(res, 200, "crear ticket");
  return res.body;
}
