import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const logout = vi.fn();
let logoutState = { isPending: false };
let user: { name: string; role: "admin" | "agente" } | undefined = {
  name: "Ana Pérez",
  role: "agente",
};
let location: { pathname: string; search: Record<string, unknown> } = {
  pathname: "/tickets",
  search: {},
};

vi.mock("@/features/auth/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ data: user }),
}));

vi.mock("@/features/auth/hooks/useLogout", () => ({
  useLogout: () => ({ mutate: logout, ...logoutState }),
}));

vi.mock("@/features/auth/components/ChangePasswordDialog", () => ({
  ChangePasswordDialog: () => (
    <button type="button" aria-label="Cambiar mi contraseña">
      candado
    </button>
  ),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: { location: typeof location }) => unknown }) =>
    select({ location }),
}));

import { Topbar } from "@/components/layout/Topbar";

describe("Topbar", () => {
  beforeEach(() => {
    logout.mockReset();
    logoutState = { isPending: false };
    user = { name: "Ana Pérez", role: "agente" };
    location = { pathname: "/tickets", search: {} };
  });

  it("muestra el avatar con las iniciales y el nombre del usuario", () => {
    render(<Topbar />);

    expect(screen.getByText("AP")).toBeInTheDocument();
    expect(screen.getByTestId("topbar-user")).toHaveTextContent("Ana Pérez");
  });

  it("muestra las migas de pan de la ruta", () => {
    location = { pathname: "/admin/usuarios", search: {} };

    render(<Topbar />);

    const nav = screen.getByRole("navigation", { name: "Migas de pan" });
    expect(nav).toHaveTextContent("Administración");
    expect(nav).toHaveTextContent("Usuarios");
    expect(screen.getByText("Usuarios")).toHaveAttribute("aria-current", "page");
  });

  it("en los catálogos, la miga es el catálogo de la URL", () => {
    location = { pathname: "/admin/catalogos", search: { catalogo: "tipos" } };

    render(<Topbar />);

    expect(screen.getByRole("navigation", { name: "Migas de pan" })).toHaveTextContent(
      "Catálogos/Tipos de ticket",
    );
  });

  it("sin migas para la ruta, no dibuja la navegación", () => {
    location = { pathname: "/", search: {} };

    render(<Topbar />);

    expect(screen.queryByRole("navigation", { name: "Migas de pan" })).not.toBeInTheDocument();
  });

  it("tiene el interruptor de tema y el acceso a cambiar la contraseña", () => {
    render(<Topbar />);

    expect(screen.getByRole("button", { name: "Activar modo oscuro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambiar mi contraseña" })).toBeInTheDocument();
  });

  it("«Cerrar sesión» llama al cierre de sesión", async () => {
    render(<Topbar />);

    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("«Cerrar sesión» se deshabilita mientras corre", () => {
    logoutState = { isPending: true };

    render(<Topbar />);

    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeDisabled();
  });

  it("mientras no hay usuario, el avatar muestra un signo de pregunta", () => {
    user = undefined;

    render(<Topbar />);

    expect(screen.getByText("?")).toBeInTheDocument();
  });
});
