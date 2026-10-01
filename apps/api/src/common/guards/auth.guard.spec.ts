import { type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import type { Auth } from "../../modules/auth/auth.config";
import type { AuthenticatedRequest } from "../authenticated-request";
import { Public } from "../decorators/public.decorator";
import { AuthGuard } from "./auth.guard";

class Probe {
  @Public()
  open() {}

  closed() {}
}

interface SessionUser {
  id: string;
  username: string | null;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  banExpires: Date | null;
}

const baseUser: SessionUser = {
  id: "ana",
  username: "ana",
  name: "Ana",
  email: "ana@syc.local",
  role: "agente",
  banned: false,
  banExpires: null,
};

function setup(session: { user: SessionUser } | null) {
  const getSession = vi.fn(async () => session);
  const guard = new AuthGuard({ api: { getSession } } as unknown as Auth, new Reflector());
  const run = (handler: "open" | "closed") => {
    const request: AuthenticatedRequest = { headers: { cookie: "better-auth.session_token=x" } };
    const context = {
      getHandler: () => Probe.prototype[handler],
      getClass: () => Probe,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { request, result: guard.canActivate(context) };
  };
  return { run, getSession };
}

describe("AuthGuard", () => {
  it("deja pasar lo marcado con @Public() sin consultar la sesión", async () => {
    const { run, getSession } = setup(null);

    await expect(run("open").result).resolves.toBe(true);
    expect(getSession).not.toHaveBeenCalled();
  });

  it("deniega por defecto: sin sesión responde 401", async () => {
    const { run } = setup(null);

    await expect(run("closed").result).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("con sesión deja al usuario en la request", async () => {
    const { run } = setup({ user: baseUser });

    const { request, result } = run("closed");

    await expect(result).resolves.toBe(true);
    expect(request.currentUser).toEqual({
      id: "ana",
      username: "ana",
      name: "Ana",
      email: "ana@syc.local",
      role: "agente",
    });
  });

  it.each([
    ["admin", "admin"],
    ["agente", "agente"],
    [null, "agente"],
    ["desconocido", "agente"],
  ])("rol %s -> %s (nunca eleva por un rol que no conoce)", async (role, expected) => {
    const { run } = setup({ user: { ...baseUser, role } });

    const { request, result } = run("closed");
    await result;

    expect(request.currentUser?.role).toBe(expected);
  });

  describe("usuario desactivado (ban)", () => {
    it("rechaza con 401 una sesión que sobrevivió al ban", async () => {
      const { run } = setup({ user: { ...baseUser, banned: true } });

      await expect(run("closed").result).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("rechaza un ban con vencimiento futuro", async () => {
      const { run } = setup({
        user: { ...baseUser, banned: true, banExpires: new Date(Date.now() + 60_000) },
      });

      await expect(run("closed").result).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("deja pasar un ban que ya venció", async () => {
      const { run } = setup({
        user: { ...baseUser, banned: true, banExpires: new Date(Date.now() - 60_000) },
      });

      await expect(run("closed").result).resolves.toBe(true);
    });
  });
});
