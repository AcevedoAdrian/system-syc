import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Page } from "./Page";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renderiza un único h1 con el título", () => {
    render(
      <Page>
        <PageHeader title="Tickets" description="Seguimiento de solicitudes." />
      </Page>,
    );

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Tickets");
  });

  it("muestra la descripción y las acciones a un lado del título", () => {
    render(
      <PageHeader
        title="Tickets"
        description="Seguimiento de solicitudes."
        actions={<button type="button">Nuevo ticket</button>}
      />,
    );

    expect(screen.getByText("Seguimiento de solicitudes.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuevo ticket" })).toBeInTheDocument();
  });

  it("usa la serif de la base visual en el título", () => {
    render(<PageHeader title="Tickets" />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveClass("font-display");
  });
});

describe("Page", () => {
  it("renderiza sus hijos dentro del contenedor estándar", () => {
    render(
      <Page className="extra">
        <p>Contenido</p>
      </Page>,
    );

    const content = screen.getByText("Contenido");
    expect(content.parentElement).toHaveClass("max-w-[1200px]", "flex-col", "extra");
  });
});
