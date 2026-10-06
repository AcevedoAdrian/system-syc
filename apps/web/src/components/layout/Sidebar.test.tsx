import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

let role: "admin" | "agente" = "agente";

vi.mock("@/features/auth/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ data: { name: "Ana", role } }),
}));

vi.mock("@/features/health/components/HealthIndicator", () => ({
  HealthIndicator: () => <p data-testid="health-indicator">salud</p>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  it("muestra Administración solo al admin", () => {
    role = "admin";
    render(<Sidebar />);

    expect(screen.getByText("Administración")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Departamentos" })).toHaveAttribute(
      "href",
      "/admin/departamentos",
    );
    expect(screen.getByRole("link", { name: "Catálogos" })).toHaveAttribute(
      "href",
      "/admin/catalogos",
    );
    expect(screen.getByRole("link", { name: "Usuarios" })).toHaveAttribute(
      "href",
      "/admin/usuarios",
    );
  });

  it("la oculta a un agente", () => {
    role = "agente";
    render(<Sidebar />);

    expect(screen.queryByText("Administración")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Usuarios" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Catálogos" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tickets" })).toBeInTheDocument();
  });

  it("muestra el link Tickets a todos, y ya no hay un Inicio aparte", () => {
    for (const next of ["agente", "admin"] as const) {
      role = next;
      const { unmount } = render(<Sidebar />);

      expect(screen.getByRole("link", { name: "Tickets" })).toHaveAttribute("href", "/tickets");
      expect(screen.queryByRole("link", { name: "Inicio" })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("deja el estado de la API al pie del menú", () => {
    role = "agente";
    render(<Sidebar />);

    expect(screen.getByTestId("health-indicator")).toBeInTheDocument();
  });
});
