import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/health/hooks/useHealth", () => ({
  useHealth: () => ({
    data: { status: "ok", database: "up", timestamp: "2026-01-01T00:00:00.000Z" },
    isPending: false,
    isError: false,
  }),
}));

import { Route } from "./index";

describe("página /", () => {
  it("muestra el estado devuelto por useHealth", () => {
    const Page = Route.options.component;
    if (!Page) throw new Error("La ruta / no define un componente");

    render(<Page />);

    expect(screen.getByTestId("health-status")).toHaveTextContent("ok");
    expect(screen.getByTestId("health-database")).toHaveTextContent("up");
  });
});
