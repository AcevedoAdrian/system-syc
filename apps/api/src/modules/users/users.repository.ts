import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { getPrismaClient } from "@syc/db";
import type { UserRole } from "../../common/authenticated-request";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env.schema";
import type { Auth } from "../auth/auth.config";
import { AUTH } from "../auth/auth.tokens";

export interface DepartmentRow {
  id: string;
  nombre: string;
}

export interface DepartmentStatus extends DepartmentRow {
  activo: boolean;
}

export interface UserRecord {
  id: string;
  username: string;
  name: string;
  email: string;
  role: UserRole;
  activo: boolean;
  // Un agente tiene exactamente uno; la lista permite detectar estados inconsistentes.
  memberships: DepartmentRow[];
}

export interface NewUser {
  username: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  organizationId?: string;
}

export interface UserChanges {
  name?: string;
  email?: string;
  username?: string;
  role?: UserRole;
}

const withMemberships = {
  members: {
    orderBy: { createdAt: "asc" },
    include: { organization: { select: { id: true, name: true } } },
  },
} as const;

function toRecord(row: {
  id: string;
  username: string | null;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  banExpires: Date | null;
  members: { organization: { id: string; name: string } }[];
}): UserRecord {
  const isBanned = row.banned === true && (!row.banExpires || row.banExpires > new Date());
  return {
    id: row.id,
    username: row.username ?? "",
    name: row.name,
    email: row.email,
    role: row.role === "admin" ? "admin" : "agente",
    activo: !isBanned,
    memberships: row.members.map((m) => ({ id: m.organization.id, nombre: m.organization.name })),
  };
}

@Injectable()
export class UsersRepository {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(AUTH) private readonly auth: Auth,
  ) {}

  private get db() {
    return getPrismaClient(this.env.DATABASE_URL);
  }

  // El departamento se lee de `Member` en cada request, no de la sesión.
  async findDepartmentOf(userId: string): Promise<DepartmentRow | null> {
    const member = await this.db.member.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { organization: { select: { id: true, name: true } } },
    });
    return member ? { id: member.organization.id, nombre: member.organization.name } : null;
  }

  async findAll(): Promise<UserRecord[]> {
    const rows = await this.db.user.findMany({
      include: withMemberships,
      orderBy: { name: "asc" },
    });
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = await this.db.user.findUnique({ where: { id }, include: withMemberships });
    return row ? toRecord(row) : null;
  }

  async countActiveAdmins(): Promise<number> {
    return this.db.user.count({
      where: {
        role: "admin",
        OR: [{ banned: null }, { banned: false }, { banExpires: { lt: new Date() } }],
      },
    });
  }

  async findIdByUsername(username: string): Promise<string | null> {
    const row = await this.db.user.findUnique({ where: { username }, select: { id: true } });
    return row?.id ?? null;
  }

  async findIdByEmail(email: string): Promise<string | null> {
    const row = await this.db.user.findUnique({ where: { email }, select: { id: true } });
    return row?.id ?? null;
  }

  async findDepartment(id: string): Promise<DepartmentStatus | null> {
    const row = await this.db.organization.findUnique({ where: { id } });
    return row ? { id: row.id, nombre: row.name, activo: row.activo } : null;
  }

  // Crea el usuario con Better Auth (hash de contraseña y cuenta de credenciales) y, si es agente,
  // su `Member`. Si falla el `Member`, se deshace el usuario para no dejar un agente sin departamento.
  async createUser(data: NewUser, headers: Headers): Promise<string> {
    const { user } = await this.auth.api.createUser({
      headers,
      body: {
        email: data.email,
        password: data.password,
        name: data.name,
        role: data.role as "admin",
        data: { username: data.username },
      },
    });
    if (data.organizationId) {
      try {
        await this.setMembership(user.id, data.organizationId);
      } catch (error) {
        await (await this.auth.$context).internalAdapter.deleteUser(user.id);
        throw error;
      }
    }
    return user.id;
  }

  async updateUser(userId: string, changes: UserChanges, headers: Headers): Promise<void> {
    await this.auth.api.adminUpdateUser({ headers, body: { userId, data: changes } });
  }

  // Ban sin vencimiento: cierra las sesiones activas del usuario y bloquea su login.
  async banUser(userId: string, headers: Headers): Promise<void> {
    await this.auth.api.banUser({ headers, body: { userId } });
  }

  async unbanUser(userId: string, headers: Headers): Promise<void> {
    await this.auth.api.unbanUser({ headers, body: { userId } });
  }

  // El admin fija la contraseña sin conocer la anterior; además se cierran las sesiones del usuario.
  async setPassword(userId: string, password: string, headers: Headers): Promise<void> {
    await this.auth.api.setUserPassword({ headers, body: { userId, newPassword: password } });
    await this.auth.api.revokeUserSessions({ headers, body: { userId } });
  }

  // Deja al usuario con exactamente un `Member` en `organizationId`, o con ninguno si es `null`.
  // Agrega el nuevo y quita los anteriores en una sola transacción: nunca queda sin departamento.
  async setMembership(userId: string, organizationId: string | null): Promise<void> {
    await this.db.$transaction(async (tx) => {
      if (organizationId === null) {
        await tx.member.deleteMany({ where: { userId } });
        return;
      }
      const existing = await tx.member.findFirst({ where: { userId, organizationId } });
      if (!existing) {
        await tx.member.create({
          data: { id: randomUUID(), userId, organizationId, role: "agente", createdAt: new Date() },
        });
      }
      await tx.member.deleteMany({ where: { userId, NOT: { organizationId } } });
    });
  }
}
