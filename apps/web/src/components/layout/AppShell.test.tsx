import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./Sidebar", () => ({ Sidebar: () => <aside data-testid="sidebar" /> }));
vi.mock("./Topbar", () => ({ Topbar: () => <header data-testid="topbar" /> }));

import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("arma la barra lateral, la superior y el contenido", () => {
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>,
    );

    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("topbar")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("contenido");
  });

  it("la barra superior queda dentro de la columna del contenido, no sobre la lateral", () => {
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>,
    );

    const column = screen.getByRole("main").parentElement as HTMLElement;
    expect(column).toContainElement(screen.getByTestId("topbar"));
    expect(column).not.toContainElement(screen.getByTestId("sidebar"));
  });
});
