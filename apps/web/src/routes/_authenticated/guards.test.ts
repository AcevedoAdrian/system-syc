import type { User } from "@syc/contracts";
import { describe, expect, it, vi } from "vitest";

const { getCurrentUser } = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<User | null>>(),
}));
vi.mock("@/features/auth/session", () => ({ getCurrentUser }));
// El layout arrastra el cliente oRPC (que exige VITE_API_URL); acá solo importan las guardas.
vi.mock("@/components/layout/AppShell", () => ({ AppShell: () => null }));

import { Route as AuthenticatedRoute } from "../_authenticated";
import { Route as AdminRoute } from "./admin/route";

type BeforeLoad = (ctx: unknown) => unknown;

function beforeLoadOf(route: { options: { beforeLoad?: unknown } }): BeforeLoad {
  const { beforeLoad } = route.options;
  if (typeof beforeLoad !== "function") throw new Error("La ruta no define beforeLoad");
  return beforeLoad as BeforeLoad;
}

const agente: User = {
  id: "u1",
  username: "ana",
  name: "Ana",
  email: null,
  role: "agente",
  activo: true,
  department: { id: "d1", nombre: "Técnico" },
};

describe("guardas de ruta", () => {
  it("sin sesión, _authenticated/* redirige a /login", async () => {
    getCurrentUser.mockResolvedValue(null);
    const run = beforeLoadOf(AuthenticatedRoute)({ location: { href: "/admin/usuarios" } });
    await expect(run).rejects.toMatchObject({ options: { to: "/login" } });
  });

  it("con sesión, _authenticated/* deja pasar y expone el usuario", async () => {
    getCurrentUser.mockResolvedValue(agente);
    const result = await beforeLoadOf(AuthenticatedRoute)({ location: { href: "/" } });
    expect(result).toEqual({ currentUser: agente });
  });

  it("un agente que entra por URL a /admin/* vuelve a /", () => {
    const run = () => beforeLoadOf(AdminRoute)({ context: { currentUser: agente } });
    expect(run).toThrowError(
      expect.objectContaining({ options: expect.objectContaining({ to: "/" }) }),
    );
  });

  it("un admin entra a /admin/*", () => {
    const admin: User = { ...agente, role: "admin", department: null };
    expect(beforeLoadOf(AdminRoute)({ context: { currentUser: admin } })).toBeUndefined();
  });
});
