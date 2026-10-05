import { describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "../../common/authenticated-request";
import type { AuditEntry } from "../audit/audit.repository";
import type { AuditService } from "../audit/audit.service";
import type { DepartmentStatus, UserRecord, UsersRepository } from "./users.repository";
import { UsersService } from "./users.service";

const TEC: DepartmentStatus = { id: "tec", nombre: "Técnico", activo: true };
const RED: DepartmentStatus = { id: "red", nombre: "Redes", activo: true };
const OFF: DepartmentStatus = { id: "off", nombre: "Cerrado", activo: false };
const headers = new Headers();

function user(id: string, extra: Partial<UserRecord> = {}): UserRecord {
  return {
    id,
    username: id,
    name: id.toUpperCase(),
    email: `${id}@syc.local`,
    role: "agente",
    activo: true,
    memberships: [{ id: TEC.id, nombre: TEC.nombre }],
    ...extra,
  };
}

const admin = (id: string, extra: Partial<UserRecord> = {}) =>
  user(id, { role: "admin", memberships: [], ...extra });

const actorOf = (id: string): AuthenticatedUser => ({
  id,
  username: id,
  name: id,
  email: `${id}@syc.local`,
  role: "admin",
});

// Repository en memoria con las mismas reglas de datos que el real: un `Member` por agente.
function buildService(initial: UserRecord[], options: { failAudit?: boolean } = {}) {
  const users = initial.map((u) => ({ ...u, memberships: [...u.memberships] }));
  const departments = [TEC, RED, OFF];
  const calls = { banned: [] as string[], unbanned: [] as string[], passwords: [] as string[][] };
  const find = (id: string) => users.find((u) => u.id === id) as UserRecord;
  const department = (id: string) => {
    const found = departments.find((d) => d.id === id) as DepartmentStatus;
    return { id: found.id, nombre: found.nombre };
  };
  const repository = {
    findDepartmentOf: async (id: string) => users.find((u) => u.id === id)?.memberships[0] ?? null,
    findAll: async () => users,
    // Como el repository real: cada lectura devuelve una fila nueva, no la que luego se muta.
    findById: async (id: string) => {
      const found = users.find((u) => u.id === id);
      return found ? { ...found, memberships: [...found.memberships] } : null;
    },
    findIdByUsername: async (name: string) => users.find((u) => u.username === name)?.id ?? null,
    findIdByEmail: async (email: string) => users.find((u) => u.email === email)?.id ?? null,
    findDepartment: async (id: string) => departments.find((d) => d.id === id) ?? null,
    countActiveAdmins: async () => users.filter((u) => u.role === "admin" && u.activo).length,
    createUser: async (data: {
      username: string;
      name: string;
      email: string;
      role: "admin" | "agente";
      organizationId?: string;
    }) => {
      const id = `new-${users.length}`;
      users.push({
        id,
        username: data.username,
        name: data.name,
        email: data.email,
        role: data.role,
        activo: true,
        memberships: data.organizationId ? [department(data.organizationId)] : [],
      });
      return id;
    },
    updateUser: async (id: string, changes: Partial<UserRecord>) => {
      Object.assign(find(id), changes);
    },
    setMembership: async (id: string, organizationId: string | null) => {
      find(id).memberships = organizationId === null ? [] : [department(organizationId)];
    },
    banUser: async (id: string) => {
      find(id).activo = false;
      calls.banned.push(id);
    },
    unbanUser: async (id: string) => {
      find(id).activo = true;
      calls.unbanned.push(id);
    },
    setPassword: async (id: string, password: string) => {
      calls.passwords.push([id, password]);
    },
  } as unknown as UsersRepository;
  const audits: AuditEntry[] = [];
  const audit = {
    history: async (entityType: string, entityId: string) => [{ entityType, entityId }],
    log: async (entry: AuditEntry) => {
      if (options.failAudit) throw new Error("falló la auditoría");
      audits.push(entry);
    },
  } as unknown as AuditService;
  return { service: new UsersService(repository, audit), users, calls, find, audits };
}

const newAgent = {
  username: "Ana",
  name: "Ana Pérez",
  password: "clave-1234",
  role: "agente" as const,
  organizationId: TEC.id,
};

describe("UsersService.create", () => {
  it("da de alta un agente con email interno, que no se muestra", async () => {
    const { service, users } = buildService([admin("root")]);

    const created = await service.create(newAgent, actorOf("root"), headers);

    expect(created).toMatchObject({ username: "ana", email: null, role: "agente", activo: true });
    expect(created.department).toEqual({ id: "tec", nombre: "Técnico" });
    expect(users.at(-1)?.email).toBe("ana@syc.local");
  });

  it("guarda y muestra el email real, en minúsculas", async () => {
    const { service } = buildService([admin("root")]);

    const created = await service.create(
      { ...newAgent, email: "Ana@Corp.com" },
      actorOf("root"),
      headers,
    );

    expect(created.email).toBe("ana@corp.com");
  });

  it.each([
    ["sin departamento", undefined],
    ["con un departamento inexistente", "nope"],
    ["con un departamento desactivado", OFF.id],
  ])("rechaza con 400 un agente %s", async (_caso, organizationId) => {
    const { service } = buildService([admin("root")]);

    await expect(
      service.create({ ...newAgent, organizationId }, actorOf("root"), headers),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("da de alta un admin sin departamento", async () => {
    const { service } = buildService([admin("root")]);

    const created = await service.create(
      { ...newAgent, username: "jefe", role: "admin", organizationId: undefined },
      actorOf("root"),
      headers,
    );

    expect(created).toMatchObject({ role: "admin", department: null });
  });

  it("rechaza con 409 un username repetido sin distinguir mayúsculas", async () => {
    const { service } = buildService([user("ana")]);

    await expect(
      service.create({ ...newAgent, username: "ANA" }, actorOf("root"), headers),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("rechaza con 409 un email ya usado", async () => {
    const { service } = buildService([user("beto", { email: "beto@corp.com" })]);

    await expect(
      service.create({ ...newAgent, email: "BETO@corp.com" }, actorOf("root"), headers),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("UsersService.update: departamento y rol", () => {
  it("cambiar el departamento deja exactamente uno", async () => {
    const { service, find } = buildService([admin("root"), user("ana")]);

    const updated = await service.update(
      { userId: "ana", organizationId: RED.id },
      actorOf("root"),
      headers,
    );

    expect(updated.department?.id).toBe("red");
    expect(find("ana").memberships).toHaveLength(1);
  });

  it("promover a admin le quita el departamento", async () => {
    const { service, find } = buildService([admin("root"), user("ana")]);

    const updated = await service.update(
      { userId: "ana", role: "admin" },
      actorOf("root"),
      headers,
    );

    expect(updated).toMatchObject({ role: "admin", department: null });
    expect(find("ana").memberships).toHaveLength(0);
  });

  it("rechaza con 400 promover a admin indicando un departamento", async () => {
    const { service } = buildService([admin("root"), user("ana")]);

    await expect(
      service.update(
        { userId: "ana", role: "admin", organizationId: RED.id },
        actorOf("root"),
        headers,
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rechaza con 400 degradar a un admin sin departamento en la misma request", async () => {
    const { service } = buildService([admin("root"), admin("jefe")]);

    await expect(
      service.update({ userId: "jefe", role: "agente" }, actorOf("root"), headers),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rechaza con 400 degradar a un departamento desactivado", async () => {
    const { service } = buildService([admin("root"), admin("jefe")]);

    await expect(
      service.update(
        { userId: "jefe", role: "agente", organizationId: OFF.id },
        actorOf("root"),
        headers,
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("degrada a un admin con un departamento activo", async () => {
    const { service } = buildService([admin("root"), admin("jefe")]);

    const updated = await service.update(
      { userId: "jefe", role: "agente", organizationId: RED.id },
      actorOf("root"),
      headers,
    );

    expect(updated).toMatchObject({ role: "agente", department: { id: "red" } });
  });

  it("rechaza con 400 dejar a un agente con un departamento desactivado", async () => {
    const { service } = buildService([admin("root"), user("ana")]);

    await expect(
      service.update({ userId: "ana", organizationId: OFF.id }, actorOf("root"), headers),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rechaza con 400 editar a un agente en estado inconsistente sin indicar su departamento", async () => {
    const { service } = buildService([admin("root"), user("ana", { memberships: [] })]);

    await expect(
      service.update({ userId: "ana", name: "Otra" }, actorOf("root"), headers),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("responde 404 si el usuario no existe", async () => {
    const { service } = buildService([admin("root")]);

    await expect(
      service.update({ userId: "nope", name: "X" }, actorOf("root"), headers),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("UsersService.update: username y email", () => {
  it("cambiar el username regenera el email interno", async () => {
    const { service, find } = buildService([admin("root"), user("ana")]);

    await service.update({ userId: "ana", username: "Ana.G" }, actorOf("root"), headers);

    expect(find("ana")).toMatchObject({ username: "ana.g", email: "ana.g@syc.local" });
  });

  it("cambiar el username no toca un email real", async () => {
    const { service, find } = buildService([admin("root"), user("ana", { email: "ana@corp.com" })]);

    await service.update({ userId: "ana", username: "ana.g" }, actorOf("root"), headers);

    expect(find("ana").email).toBe("ana@corp.com");
  });

  it("email null vuelve al email interno", async () => {
    const { service, find } = buildService([admin("root"), user("ana", { email: "ana@corp.com" })]);

    const updated = await service.update({ userId: "ana", email: null }, actorOf("root"), headers);

    expect(find("ana").email).toBe("ana@syc.local");
    expect(updated.email).toBeNull();
  });

  it("rechaza con 409 el username o el email de otro usuario", async () => {
    const { service } = buildService([
      admin("root"),
      user("ana"),
      user("beto", { email: "b@corp.com" }),
    ]);

    await expect(
      service.update({ userId: "ana", username: "BETO" }, actorOf("root"), headers),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.update({ userId: "ana", email: "b@corp.com" }, actorOf("root"), headers),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("no considera conflicto quedarse con su propio username", async () => {
    const { service } = buildService([admin("root"), user("ana")]);

    await expect(
      service.update(
        { userId: "ana", username: "ANA", name: "Ana Nueva" },
        actorOf("root"),
        headers,
      ),
    ).resolves.toMatchObject({ name: "Ana Nueva" });
  });
});

describe("UsersService: protecciones del último admin y de uno mismo", () => {
  it("no deja degradarse a sí mismo", async () => {
    const { service } = buildService([admin("root"), admin("jefe")]);

    await expect(
      service.update(
        { userId: "root", role: "agente", organizationId: TEC.id },
        actorOf("root"),
        headers,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("no deja degradar al último admin activo", async () => {
    const { service } = buildService([admin("root"), admin("jefe", { activo: false })]);

    await expect(
      service.update(
        { userId: "root", role: "agente", organizationId: TEC.id },
        actorOf("otro"),
        headers,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("deja degradar a otro admin cuando hay más de uno activo", async () => {
    const { service } = buildService([admin("root"), admin("jefe")]);

    await expect(
      service.update(
        { userId: "jefe", role: "agente", organizationId: TEC.id },
        actorOf("root"),
        headers,
      ),
    ).resolves.toMatchObject({ role: "agente" });
  });

  it("no deja desactivarse a sí mismo", async () => {
    const { service, calls } = buildService([admin("root"), admin("jefe")]);

    await expect(
      service.setActive({ userId: "root", activo: false }, actorOf("root"), headers),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(calls.banned).toEqual([]);
  });

  it("no deja desactivar al último admin activo", async () => {
    const { service, calls } = buildService([admin("root"), user("ana")]);

    await expect(
      service.setActive({ userId: "root", activo: false }, actorOf("ana"), headers),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(calls.banned).toEqual([]);
  });
});

describe("UsersService.setActive", () => {
  it("desactiva (ban) a un agente y lo muestra desactivado", async () => {
    const { service, calls } = buildService([admin("root"), user("ana")]);

    const updated = await service.setActive(
      { userId: "ana", activo: false },
      actorOf("root"),
      headers,
    );

    expect(updated.activo).toBe(false);
    expect(calls.banned).toEqual(["ana"]);
  });

  it("reactiva (unban) y no aplica las protecciones", async () => {
    const { service, calls } = buildService([admin("root"), user("ana", { activo: false })]);

    const updated = await service.setActive(
      { userId: "ana", activo: true },
      actorOf("root"),
      headers,
    );

    expect(updated.activo).toBe(true);
    expect(calls.unbanned).toEqual(["ana"]);
  });

  it("deja desactivar a otro admin cuando hay más de uno activo", async () => {
    const { service } = buildService([admin("root"), admin("jefe")]);

    await expect(
      service.setActive({ userId: "jefe", activo: false }, actorOf("root"), headers),
    ).resolves.toMatchObject({ activo: false });
  });
});

describe("UsersService.resetPassword", () => {
  it("fija la contraseña nueva sin pedir la anterior", async () => {
    const { service, calls } = buildService([admin("root"), user("ana")]);

    await service.resetPassword(
      { userId: "ana", password: "nueva-clave-99" },
      actorOf("root"),
      headers,
    );

    expect(calls.passwords).toEqual([["ana", "nueva-clave-99"]]);
  });

  it("responde 404 si el usuario no existe", async () => {
    const { service, calls } = buildService([admin("root")]);

    await expect(
      service.resetPassword(
        { userId: "nope", password: "nueva-clave-99" },
        actorOf("root"),
        headers,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(calls.passwords).toEqual([]);
  });
});

describe("UsersService.list y me", () => {
  it("lista a los desactivados y oculta los emails internos", async () => {
    const { service } = buildService([
      admin("root"),
      user("ana", { activo: false }),
      user("beto", { email: "beto@corp.com" }),
    ]);

    const list = await service.list();

    expect(list.map((u) => [u.username, u.activo, u.email])).toEqual([
      ["root", true, null],
      ["ana", false, null],
      ["beto", true, "beto@corp.com"],
    ]);
  });

  it("me devuelve al usuario de la sesión con su departamento", async () => {
    const { service } = buildService([user("ana")]);

    const me = await service.me(actorOf("ana"));

    expect(me).toMatchObject({ id: "ana", activo: true, email: null, department: { id: "tec" } });
  });
});

describe("UsersService: auditoría", () => {
  it("el alta deja un create con la foto inicial, sin contraseña, y el admin como actor", async () => {
    const { service, audits } = buildService([admin("root")]);

    const created = await service.create(newAgent, actorOf("root"), headers);

    expect(audits).toEqual([
      {
        entityType: "User",
        entityId: created.id,
        action: "create",
        actorId: "root",
        payload: {
          after: {
            username: "ana",
            name: "Ana Pérez",
            email: null,
            role: "agente",
            activo: true,
            departamento: { id: "tec", nombre: "Técnico" },
          },
        },
      },
    ]);
    expect(JSON.stringify(audits)).not.toContain("clave-1234");
  });

  it("editar nombre, rol y departamento a la vez deja un solo update con los tres campos", async () => {
    const { service, audits } = buildService([admin("root"), admin("jefe")]);

    await service.update(
      { userId: "jefe", name: "Jefe Nuevo", role: "agente", organizationId: RED.id },
      actorOf("root"),
      headers,
    );

    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      entityType: "User",
      entityId: "jefe",
      action: "update",
      actorId: "root",
      payload: {
        before: { name: "JEFE", role: "admin", departamento: null },
        after: {
          name: "Jefe Nuevo",
          role: "agente",
          departamento: { id: "red", nombre: "Redes" },
        },
      },
    });
  });

  it("cambiar el departamento deja el diff con { id, nombre } antes y después", async () => {
    const { service, audits } = buildService([admin("root"), user("ana")]);

    await service.update({ userId: "ana", organizationId: RED.id }, actorOf("root"), headers);

    expect(audits[0]?.payload).toEqual({
      before: { departamento: { id: "tec", nombre: "Técnico" } },
      after: { departamento: { id: "red", nombre: "Redes" } },
    });
  });

  it("cambiar el username incluye solo lo visible: el email interno no entra en el diff", async () => {
    const { service, audits } = buildService([admin("root"), user("ana")]);

    await service.update({ userId: "ana", username: "ana.g" }, actorOf("root"), headers);

    expect(audits[0]?.payload).toEqual({
      before: { username: "ana" },
      after: { username: "ana.g" },
    });
  });

  it("una edición sin cambios efectivos no deja registro", async () => {
    const { service, audits } = buildService([admin("root"), user("ana")]);

    await service.update(
      { userId: "ana", name: "ANA", organizationId: TEC.id },
      actorOf("root"),
      headers,
    );

    expect(audits).toEqual([]);
  });

  it("desactivar y reactivar dejan un update de activo cada uno", async () => {
    const { service, audits } = buildService([admin("root"), user("ana")]);

    await service.setActive({ userId: "ana", activo: false }, actorOf("root"), headers);
    await service.setActive({ userId: "ana", activo: true }, actorOf("root"), headers);

    expect(audits.map((a) => [a.action, a.payload])).toEqual([
      ["update", { before: { activo: true }, after: { activo: false } }],
      ["update", { before: { activo: false }, after: { activo: true } }],
    ]);
  });

  it("setActive con el estado actual no deja registro", async () => {
    const { service, audits } = buildService([admin("root"), user("ana")]);

    await service.setActive({ userId: "ana", activo: true }, actorOf("root"), headers);

    expect(audits).toEqual([]);
  });

  it("resetear la contraseña deja reset_password con payload vacío y sin la contraseña", async () => {
    const { service, audits } = buildService([admin("root"), user("ana")]);

    await service.resetPassword(
      { userId: "ana", password: "nueva-clave-99" },
      actorOf("root"),
      headers,
    );

    expect(audits).toEqual([
      {
        entityType: "User",
        entityId: "ana",
        action: "reset_password",
        actorId: "root",
        payload: {},
      },
    ]);
  });

  it("una operación rechazada no deja registro", async () => {
    const { service, audits } = buildService([admin("root"), user("ana")]);

    await expect(
      service.setActive({ userId: "root", activo: false }, actorOf("root"), headers),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.resetPassword(
        { userId: "nope", password: "nueva-clave-99" },
        actorOf("root"),
        headers,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(audits).toEqual([]);
  });

  it("si falla la escritura del AuditLog el error sube (500), pero el cambio ya quedó aplicado", async () => {
    const { service, find } = buildService([admin("root"), user("ana")], { failAudit: true });

    await expect(
      service.setActive({ userId: "ana", activo: false }, actorOf("root"), headers),
    ).rejects.toThrow("falló la auditoría");

    expect(find("ana").activo).toBe(false);
  });
});

describe("UsersService.history", () => {
  it("lee el historial de User por id, sin chequear que el usuario exista", async () => {
    const { service } = buildService([admin("root")]);

    await expect(service.history("nope")).resolves.toEqual([
      { entityType: "User", entityId: "nope" },
    ]);
  });
});
