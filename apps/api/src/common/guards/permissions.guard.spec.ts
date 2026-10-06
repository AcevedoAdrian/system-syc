import {
  type ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ModuleRef, Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedRequest, AuthenticatedUser } from "../authenticated-request";
import { RequirePermission } from "../decorators/require-permission.decorator";
import type { DepartmentReader, DepartmentResolver } from "../department-reader";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../permissions";
import { PermissionsGuard } from "./permissions.guard";

// Recurso ficticio: pertenece al departamento que viene en la URL.
class UrlDepartmentResolver implements DepartmentResolver {
  resolve(request: AuthenticatedRequest) {
    return request.params?.departmentId ?? null;
  }
}

class Probe {
  @RequirePermission(PERMISSIONS.TICKET_VIEW, { departmentFrom: UrlDepartmentResolver })
  view() {}

  @RequirePermission(PERMISSIONS.TICKET_CREATE)
  create() {}

  @RequirePermission(PERMISSIONS.TICKET_DELETE, { departmentFrom: UrlDepartmentResolver })
  remove() {}

  @RequirePermission(PERMISSIONS.MANAGE)
  manage() {}

  @RequirePermission(PERMISSIONS.TICKET_VIEW, {
    departmentFrom: UrlDepartmentResolver,
    outOfScope: "not-found",
    notFoundMessage: "El ticket no existe",
  })
  viewScoped() {}

  @RequirePermission(PERMISSIONS.TICKET_VIEW, {
    departmentFrom: UrlDepartmentResolver,
    outOfScope: "not-found",
  })
  viewScopedDefaultMessage() {}

  @RequirePermission(PERMISSIONS.TICKET_DELETE, {
    departmentFrom: UrlDepartmentResolver,
    outOfScope: "not-found",
  })
  removeScoped() {}

  open() {}
}

type Handler =
  | "view"
  | "create"
  | "remove"
  | "manage"
  | "viewScoped"
  | "viewScopedDefaultMessage"
  | "removeScoped"
  | "open";

const agente: AuthenticatedUser = {
  id: "ana",
  username: "ana",
  name: "Ana",
  email: "ana@syc.local",
  role: "agente",
};
const admin: AuthenticatedUser = { ...agente, id: "root", username: "root", role: "admin" };

function setup(departmentOfUser: string | null) {
  const resolver = new UrlDepartmentResolver();
  const resolve = vi.spyOn(resolver, "resolve");
  const reader: DepartmentReader = { findDepartmentIdOf: vi.fn(async () => departmentOfUser) };
  const moduleRef = { get: () => resolver } as unknown as ModuleRef;
  const guard = new PermissionsGuard(new Reflector(), moduleRef, reader);

  const run = (handler: Handler, user: AuthenticatedUser | undefined, departmentId = "tec") => {
    const request: AuthenticatedRequest = {
      headers: {},
      params: { departmentId },
      currentUser: user && { ...user },
    };
    const context = {
      getHandler: () => Probe.prototype[handler],
      getClass: () => Probe,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { request, result: guard.canActivate(context) };
  };
  return { run, reader, resolve };
}

describe("PermissionsGuard", () => {
  it("deja pasar un endpoint sin @RequirePermission (solo exige sesión el AuthGuard)", async () => {
    const { run } = setup("tec");

    await expect(run("open", undefined).result).resolves.toBe(true);
  });

  it("responde 401 si no hay usuario autenticado", async () => {
    const { run } = setup("tec");

    await expect(run("view", undefined).result).rejects.toBeInstanceOf(UnauthorizedException);
  });

  describe("agente", () => {
    it("opera sobre un recurso de su departamento y recibe su scope", async () => {
      const { run } = setup("tec");

      const { request, result } = run("view", agente, "tec");

      await expect(result).resolves.toBe(true);
      expect(request.currentUser?.scope).toEqual({ departmentId: "tec" });
    });

    it("recibe 403 sobre un recurso de otro departamento", async () => {
      const { run } = setup("tec");

      await expect(run("view", agente, "red").result).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("recibe 403 sobre un recurso inexistente, sin revelar si existe", async () => {
      const { run } = setup("tec");

      await expect(run("view", agente, "").result).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("crea en su departamento con el permiso de crear", async () => {
      const { run } = setup("tec");

      await expect(run("create", agente).result).resolves.toBe(true);
    });

    it("recibe 403 en lo que es solo del admin, aun en su propio departamento", async () => {
      const { run, reader } = setup("tec");

      await expect(run("remove", agente, "tec").result).rejects.toBeInstanceOf(ForbiddenException);
      await expect(run("manage", agente).result).rejects.toBeInstanceOf(ForbiddenException);
      expect(reader.findDepartmentIdOf).not.toHaveBeenCalled();
    });

    it("sin Member (estado inconsistente) recibe 403 en todo lo que exija departamento", async () => {
      const { run } = setup(null);

      await expect(run("view", agente, "tec").result).rejects.toBeInstanceOf(ForbiddenException);
      await expect(run("create", agente).result).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("lee el departamento en cada request: un cambio se ve en la siguiente", async () => {
      const first = setup("tec");
      await expect(first.run("view", agente, "tec").result).resolves.toBe(true);

      const afterMove = setup("red");
      await expect(afterMove.run("view", agente, "tec").result).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(afterMove.run("view", agente, "red").result).resolves.toBe(true);
    });
  });

  describe("admin", () => {
    it("accede a todo, en todos los departamentos, sin filtro", async () => {
      const { run, reader, resolve } = setup(null);

      for (const handler of ["view", "create", "remove", "manage"] as const) {
        const { request, result } = run(handler, admin, "cualquiera");
        await expect(result).resolves.toBe(true);
        expect(request.currentUser?.scope).toEqual({ departmentId: null });
      }
      expect(reader.findDepartmentIdOf).not.toHaveBeenCalled();
      expect(resolve).not.toHaveBeenCalled();
    });
  });
});

describe('PermissionsGuard con outOfScope: "not-found" (SPEC 05, Feature 5.8)', () => {
  it("un agente en su departamento pasa y recibe su scope", async () => {
    const { run } = setup("tec");

    const { request, result } = run("viewScoped", agente, "tec");

    await expect(result).resolves.toBe(true);
    expect(request.currentUser?.scope).toEqual({ departmentId: "tec" });
  });

  it("responde 404 sobre un recurso de otro departamento", async () => {
    const { run } = setup("tec");

    await expect(run("viewScoped", agente, "red").result).rejects.toBeInstanceOf(NotFoundException);
  });

  it("responde 404 sobre un recurso inexistente (el resolver devuelve null)", async () => {
    const { run } = setup("tec");

    await expect(run("viewScoped", agente, "").result).rejects.toBeInstanceOf(NotFoundException);
  });

  it("ajeno e inexistente dan exactamente la misma respuesta", async () => {
    const { run } = setup("tec");

    const ajeno = await run("viewScoped", agente, "red").result.catch((e: NotFoundException) => e);
    const inexistente = await run("viewScoped", agente, "").result.catch(
      (e: NotFoundException) => e,
    );

    expect(ajeno).toBeInstanceOf(NotFoundException);
    expect((ajeno as NotFoundException).getStatus()).toBe(404);
    expect((ajeno as NotFoundException).getResponse()).toEqual(
      (inexistente as NotFoundException).getResponse(),
    );
    expect((ajeno as NotFoundException).message).toBe("El ticket no existe");
  });

  it("sin `notFoundMessage` usa un mensaje genérico", async () => {
    const { run } = setup("tec");

    const error = await run("viewScopedDefaultMessage", agente, "red").result.catch(
      (e: NotFoundException) => e,
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).message).toBe("El recurso no existe");
  });

  it("el permiso se evalúa antes: un agente sin permiso recibe 403, no 404", async () => {
    const { run, reader, resolve } = setup("tec");

    await expect(run("removeScoped", agente, "tec").result).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(reader.findDepartmentIdOf).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("un agente sin Member sigue recibiendo 403 (estado inconsistente, no un recurso ajeno)", async () => {
    const { run } = setup(null);

    await expect(run("viewScoped", agente, "tec").result).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("el admin no pasa por el resolver: accede a cualquier departamento", async () => {
    const { run, resolve } = setup(null);

    const { request, result } = run("viewScoped", admin, "cualquiera");

    await expect(result).resolves.toBe(true);
    expect(request.currentUser?.scope).toEqual({ departmentId: null });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("sin la opción el comportamiento no cambia: 403", async () => {
    const { run } = setup("tec");

    await expect(run("view", agente, "red").result).rejects.toBeInstanceOf(ForbiddenException);
    await expect(run("view", agente, "").result).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("matriz de permisos (PRD §4.2)", () => {
  it("el agente solo ve, crea y edita; el admin tiene todos", () => {
    expect([...ROLE_PERMISSIONS.agente].sort()).toEqual(
      [PERMISSIONS.TICKET_VIEW, PERMISSIONS.TICKET_CREATE, PERMISSIONS.TICKET_EDIT].sort(),
    );
    expect([...ROLE_PERMISSIONS.admin].sort()).toEqual(Object.values(PERMISSIONS).sort());
  });
});
