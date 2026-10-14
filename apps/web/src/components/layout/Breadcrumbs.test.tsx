import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

let pathname = "/tickets";
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname } }),
}));

import { Breadcrumbs } from "./Breadcrumbs";

describe("Breadcrumbs", () => {
  it("muestra el recorrido y marca la última miga como la página actual", () => {
    pathname = "/tickets/nuevo";
    render(<Breadcrumbs />);

    const nav = screen.getByRole("navigation", { name: "Ruta" });
    expect(nav).toHaveTextContent("Módulos/Tickets/Nuevo ticket");
    expect(screen.getByText("Nuevo ticket")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Tickets")).not.toHaveAttribute("aria-current");
  });

  it("en una ruta sin migas no renderiza nada", () => {
    pathname = "/";
    const { container } = render(<Breadcrumbs />);

    expect(container).toBeEmptyDOMElement();
  });
});
