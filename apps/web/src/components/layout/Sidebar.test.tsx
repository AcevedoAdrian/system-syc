import { catalogRutas } from "@syc/contracts";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG_KINDS } from "@/features/catalogs/catalog-kinds";

const navigate = vi.fn();
let role: "admin" | "agente" = "agente";
let location: { pathname: string; search: Record<string, unknown> } = {
  pathname: "/tickets",
  search: {},
};

vi.mock("@/features/auth/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ data: { name: "Ana", role } }),
}));

vi.mock("@/features/health/components/HealthIndicator", () => ({
  HealthIndicator: () => <p data-testid="health-indicator">salud</p>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    children,
    ...rest
  }: {
    to: string;
    search?: { catalogo?: string };
    children: React.ReactNode;
  }) => (
    <a href={search?.catalogo ? `${to}?catalogo=${search.catalogo}` : to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
  useRouterState: ({ select }: { select: (state: { location: typeof location }) => unknown }) =>
    select({ location }),
}));

import { Sidebar } from "./Sidebar";

function renderAt(
  next: "admin" | "agente",
  pathname: string,
  search: Record<string, unknown> = {},
) {
  role = next;
  location = { pathname, search };
  return render(<Sidebar />);
}

describe("Sidebar", () => {
  beforeEach(() => navigate.mockReset());

  it("muestra Administración solo al admin", () => {
    renderAt("admin", "/tickets");

    expect(screen.getByText("Administración")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Departamentos" })).toHaveAttribute(
      "href",
      "/admin/departamentos",
    );
    expect(screen.getByRole("button", { name: "Catálogos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Usuarios" })).toHaveAttribute(
      "href",
      "/admin/usuarios",
    );
  });

  it("la oculta a un agente", () => {
    renderAt("agente", "/tickets");

    expect(screen.queryByText("Administración")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Usuarios" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Catálogos" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tickets" })).toBeInTheDocument();
  });

  it("muestra el link Tickets a todos, y ya no hay un Inicio aparte", () => {
    for (const next of ["agente", "admin"] as const) {
      const { unmount } = renderAt(next, "/tickets");

      expect(screen.getByRole("link", { name: "Tickets" })).toHaveAttribute("href", "/tickets");
      expect(screen.queryByRole("link", { name: "Inicio" })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("deja el estado de la API al pie del menú", () => {
    renderAt("agente", "/tickets");

    expect(screen.getByTestId("health-indicator")).toBeInTheDocument();
  });

  it("muestra el logo, que lleva al inicio, y la tarjeta «Próximamente»", () => {
    renderAt("agente", "/tickets");

    expect(screen.getByRole("link", { name: "system-syc" })).toHaveAttribute("href", "/");
    expect(screen.getByText("Próximamente")).toBeInTheDocument();
  });

  it("no ofrece «Tickets internos»: el sistema tiene un solo módulo de tickets", () => {
    renderAt("admin", "/tickets");

    expect(screen.queryByText(/internos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/externos/i)).not.toBeInTheDocument();
  });

  describe("entrada activa", () => {
    it.each([
      ["/tickets", "Tickets"],
      ["/tickets/nuevo", "Tickets"],
      ["/tickets/abc-123", "Tickets"],
      ["/admin/departamentos", "Departamentos"],
      ["/admin/usuarios", "Usuarios"],
    ])("en %s marca solo %s con aria-current=page", (pathname, name) => {
      renderAt("admin", pathname);

      const current = screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page");
      expect(current.map((link) => link.textContent)).toEqual([name]);
    });
  });

  describe("submenú de catálogos", () => {
    it("está cerrado fuera de los catálogos", () => {
      renderAt("admin", "/admin/usuarios");

      expect(screen.getByRole("button", { name: "Catálogos" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      expect(screen.queryByRole("link", { name: "Áreas" })).not.toBeInTheDocument();
    });

    it("se abre en los catálogos con los 8, cada uno con su enlace", () => {
      renderAt("admin", "/admin/catalogos");

      expect(screen.getByRole("button", { name: "Catálogos" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      for (const ruta of catalogRutas) {
        expect(screen.getByRole("link", { name: CATALOG_KINDS[ruta].title })).toHaveAttribute(
          "href",
          `/admin/catalogos?catalogo=${ruta}`,
        );
      }
      expect(catalogRutas).toHaveLength(8);
    });

    it("lista los catálogos en el orden de CATALOG_KINDS", () => {
      const { container } = renderAt("admin", "/admin/catalogos");

      const nav = container.querySelector("nav") as HTMLElement;
      const titles = within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent)
        .filter((text) => Object.values(CATALOG_KINDS).some((kind) => kind.title === text));
      expect(titles).toEqual(catalogRutas.map((ruta) => CATALOG_KINDS[ruta].title));
    });

    it("marca el catálogo de la URL", () => {
      renderAt("admin", "/admin/catalogos", { catalogo: "edificios" });

      expect(screen.getByRole("link", { name: "Edificios" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(screen.getByRole("link", { name: "Áreas" })).not.toHaveAttribute("aria-current");
    });

    it("sin catálogo en la URL, marca el primero", () => {
      renderAt("admin", "/admin/catalogos");

      expect(screen.getByRole("link", { name: "Áreas" })).toHaveAttribute("aria-current", "page");
    });

    it("con un catálogo desconocido, marca el primero", () => {
      renderAt("admin", "/admin/catalogos", { catalogo: "otro" });

      expect(screen.getByRole("link", { name: "Áreas" })).toHaveAttribute("aria-current", "page");
    });

    it("fuera de los catálogos, «Catálogos» lleva al catálogo por defecto", async () => {
      renderAt("admin", "/admin/usuarios");

      await userEvent.click(screen.getByRole("button", { name: "Catálogos" }));

      expect(navigate).toHaveBeenCalledWith({
        to: "/admin/catalogos",
        search: { catalogo: "areas" },
      });
    });

    it("dentro de los catálogos, «Catálogos» pliega y despliega el submenú sin navegar", async () => {
      renderAt("admin", "/admin/catalogos", { catalogo: "edificios" });
      const toggle = screen.getByRole("button", { name: "Catálogos" });

      await userEvent.click(toggle);

      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("link", { name: "Edificios" })).not.toBeInTheDocument();

      await userEvent.click(toggle);

      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("link", { name: "Edificios" })).toBeInTheDocument();
      expect(navigate).not.toHaveBeenCalled();
    });

    it("en los catálogos hay una sola página actual entre los enlaces", () => {
      renderAt("admin", "/admin/catalogos", { catalogo: "edificios" });

      const current = screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page");
      expect(current.map((link) => link.textContent)).toEqual(["Edificios"]);
    });
  });
});
