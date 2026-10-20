import type { HealthStatus } from "@syc/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const health = vi.hoisted(() => ({
  state: { data: undefined, isPending: true, isError: false } as {
    data: HealthStatus | undefined;
    isPending: boolean;
    isError: boolean;
  },
}));
vi.mock("@/features/health/hooks/useHealth", () => ({ useHealth: () => health.state }));

import { HealthIndicator } from "@/features/health/components/HealthIndicator";

const at = "2026-01-01T00:00:00.000Z";

function show(state: typeof health.state) {
  health.state = state;
  render(<HealthIndicator />);
  return screen.getByTestId("health-indicator");
}

describe("HealthIndicator", () => {
  it("muestra el estado que devuelve health.check cuando todo está bien", () => {
    const indicator = show({
      data: { status: "ok", database: "up", timestamp: at },
      isPending: false,
      isError: false,
    });

    expect(indicator).toHaveTextContent("API ok · base de datos up");
    expect(indicator.firstElementChild).toHaveClass("bg-success");
  });

  it("avisa en ámbar cuando la API responde pero la base no", () => {
    const indicator = show({
      data: { status: "degraded", database: "down", timestamp: at },
      isPending: false,
      isError: false,
    });

    expect(indicator).toHaveTextContent("API degraded · base de datos down");
    expect(indicator.firstElementChild).toHaveClass("bg-warning");
  });

  it("avisa en rojo cuando no hay conexión con la API", () => {
    const indicator = show({ data: undefined, isPending: false, isError: true });

    expect(indicator).toHaveTextContent("Sin conexión con la API");
    expect(indicator.firstElementChild).toHaveClass("bg-destructive");
  });

  it("mientras consulta no marca ni error ni éxito", () => {
    const indicator = show({ data: undefined, isPending: true, isError: false });

    expect(indicator).toHaveTextContent("Consultando estado…");
    expect(indicator.firstElementChild).not.toHaveClass("bg-destructive", "bg-success");
  });
});
