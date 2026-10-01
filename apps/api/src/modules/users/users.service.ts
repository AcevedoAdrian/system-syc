import { Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import type {
  CreateUserInput,
  ResetPasswordInput,
  SetUserActiveInput,
  UpdateUserInput,
  User,
} from "@syc/contracts";
import type { AuthenticatedUser } from "../../common/authenticated-request";
import { isInternalEmail, toInternalEmail } from "./internal-email";
import { type UserChanges, type UserRecord, UsersRepository } from "./users.repository";

function toUser(record: UserRecord): User {
  return {
    id: record.id,
    username: record.username,
    name: record.name,
    email: isInternalEmail(record.email) ? null : record.email,
    role: record.role,
    activo: record.activo,
    department: record.memberships[0] ?? null,
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly repository: UsersRepository) {}

  async me(current: AuthenticatedUser): Promise<User> {
    return {
      id: current.id,
      username: current.username,
      name: current.name,
      email: isInternalEmail(current.email) ? null : current.email,
      role: current.role,
      activo: true, // un usuario desactivado no llega acá: el AuthGuard lo rechaza
      department: await this.repository.findDepartmentOf(current.id),
    };
  }

  async list(): Promise<User[]> {
    return (await this.repository.findAll()).map(toUser);
  }

  async create(input: CreateUserInput, headers: Headers): Promise<User> {
    const username = input.username.toLowerCase();
    const organizationId = input.role === "agente" ? input.organizationId : undefined;
    if (input.role === "agente") await this.requireActiveDepartment(organizationId);

    await this.assertUsernameFree(username);
    const email = input.email?.toLowerCase() ?? toInternalEmail(username);
    await this.assertEmailFree(email);

    const id = await this.repository.createUser(
      {
        username,
        name: input.name,
        email,
        password: input.password,
        role: input.role,
        organizationId,
      },
      headers,
    );
    return toUser(await this.requireUser(id));
  }

  async update(input: UpdateUserInput, actor: AuthenticatedUser, headers: Headers): Promise<User> {
    const current = await this.requireUser(input.userId);
    const role = input.role ?? current.role;
    if (current.role === "admin" && role === "agente") {
      this.assertNotSelf(current, actor, "No podés degradarte a vos mismo");
      await this.assertNotLastActiveAdmin(current, "No se puede degradar al último admin activo");
    }
    const changes: UserChanges = {};

    if (input.name !== undefined && input.name !== current.name) changes.name = input.name;
    if (input.role !== undefined && input.role !== current.role) changes.role = input.role;

    const username = input.username?.toLowerCase() ?? current.username;
    const usernameChanged = username !== current.username;
    if (usernameChanged) {
      await this.assertUsernameFree(username, current.id);
      changes.username = username;
    }

    // Email: `null` vuelve al interno; si no se toca y era el interno, sigue al `username`.
    let email = current.email;
    if (input.email === null) email = toInternalEmail(username);
    else if (input.email !== undefined) email = input.email.toLowerCase();
    else if (usernameChanged && isInternalEmail(current.email)) email = toInternalEmail(username);
    if (email !== current.email) {
      await this.assertEmailFree(email, current.id);
      changes.email = email;
    }

    // Departamento: un agente termina con exactamente uno; un admin, con ninguno.
    let membership: string | null | undefined; // undefined = sin cambios
    if (role === "admin") {
      if (input.organizationId) {
        throw new ORPCError("BAD_REQUEST", { message: "Un admin no lleva departamento" });
      }
      if (current.memberships.length > 0) membership = null;
    } else if (input.organizationId) {
      const alreadyThere =
        current.memberships.length === 1 && current.memberships[0]?.id === input.organizationId;
      if (!alreadyThere) {
        await this.requireActiveDepartment(input.organizationId);
        membership = input.organizationId;
      }
    } else if (current.memberships.length !== 1) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Un agente debe tener exactamente un departamento: indicá uno",
      });
    }

    // Un agente nunca debe quedar sin departamento (primero `Member`, después el rol); a un admin
    // se le quita el `Member` después de cambiarle el rol.
    if (typeof membership === "string") await this.repository.setMembership(current.id, membership);
    if (Object.keys(changes).length > 0) {
      await this.repository.updateUser(current.id, changes, headers);
    }
    if (membership === null) await this.repository.setMembership(current.id, null);

    return toUser(await this.requireUser(current.id));
  }

  async setActive(
    input: SetUserActiveInput,
    actor: AuthenticatedUser,
    headers: Headers,
  ): Promise<User> {
    const target = await this.requireUser(input.userId);
    if (input.activo) {
      await this.repository.unbanUser(target.id, headers);
    } else {
      this.assertNotSelf(target, actor, "No podés desactivarte a vos mismo");
      await this.assertNotLastActiveAdmin(target, "No se puede desactivar al último admin activo");
      await this.repository.banUser(target.id, headers);
    }
    return toUser(await this.requireUser(target.id));
  }

  async resetPassword(input: ResetPasswordInput, headers: Headers): Promise<void> {
    const target = await this.requireUser(input.userId);
    await this.repository.setPassword(target.id, input.password, headers);
  }

  private assertNotSelf(target: UserRecord, actor: AuthenticatedUser, message: string): void {
    if (target.id === actor.id) throw new ORPCError("CONFLICT", { message });
  }

  private async assertNotLastActiveAdmin(target: UserRecord, message: string): Promise<void> {
    if (target.role !== "admin" || !target.activo) return;
    if ((await this.repository.countActiveAdmins()) <= 1) {
      throw new ORPCError("CONFLICT", { message });
    }
  }

  private async requireUser(id: string): Promise<UserRecord> {
    const user = await this.repository.findById(id);
    if (!user) throw new ORPCError("NOT_FOUND", { message: "El usuario no existe" });
    return user;
  }

  private async requireActiveDepartment(organizationId: string | undefined): Promise<void> {
    const department = organizationId ? await this.repository.findDepartment(organizationId) : null;
    if (!department?.activo) {
      throw new ORPCError("BAD_REQUEST", {
        message: "El departamento no existe o está desactivado",
      });
    }
  }

  private async assertUsernameFree(username: string, exceptId?: string): Promise<void> {
    const found = await this.repository.findIdByUsername(username);
    if (found && found !== exceptId) {
      throw new ORPCError("CONFLICT", {
        message: "Ya existe un usuario con ese nombre de usuario",
      });
    }
  }

  private async assertEmailFree(email: string, exceptId?: string): Promise<void> {
    const found = await this.repository.findIdByEmail(email);
    if (found && found !== exceptId) {
      throw new ORPCError("CONFLICT", { message: "Ya existe un usuario con ese email" });
    }
  }
}
