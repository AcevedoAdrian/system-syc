import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PencilIcon } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { ActivePill } from "./ActivePill";
import { PageHeader } from "./PageHeader";
import { RowAction } from "./RowAction";

describe("PageHeader", () => {
  it("muestra el título como h1, la bajada y la acción", () => {
    render(
      <PageHeader
        title="Departamentos"
        description="Equipos que atienden los tickets."
        action={<button type="button">Nuevo departamento</button>}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Departamentos" })).toHaveClass(
      "font-heading",
    );
    expect(screen.getByText("Equipos que atienden los tickets.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuevo departamento" })).toBeInTheDocument();
  });

  it("sin bajada ni acción muestra solo el título", () => {
    render(<PageHeader title="Usuarios" />);

    expect(screen.getByRole("heading", { name: "Usuarios" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("es un banner de la pantalla (header)", () => {
    const { container } = render(<PageHeader title="Usuarios" />);

    expect(container.querySelector("header")).not.toBeNull();
  });
});

describe("RowAction", () => {
  it("es un botón con su etiqueta y su tooltip, y el ícono no se lee", () => {
    render(<RowAction label="Editar «Redes»" icon={PencilIcon} onClick={() => undefined} />);

    const boton = screen.getByRole("button", { name: "Editar «Redes»" });
    expect(boton).toHaveAttribute("title", "Editar «Redes»");
    expect(boton).toHaveAttribute("type", "button");
    expect(boton.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("avisa al hacer clic, salvo que esté deshabilitado", async () => {
    const onClick = vi.fn();
    const { rerender } = render(<RowAction label="Editar" icon={PencilIcon} onClick={onClick} />);

    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    rerender(<RowAction label="Editar" icon={PencilIcon} onClick={onClick} disabled />);
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("mide 40px y la acción destructiva se tiñe de rojo al pasar el mouse", () => {
    const { rerender } = render(
      <RowAction label="Editar" icon={PencilIcon} onClick={() => undefined} />,
    );
    expect(screen.getByRole("button")).toHaveClass("size-10");
    expect(screen.getByRole("button")).not.toHaveClass("hover:text-destructive");

    rerender(
      <RowAction label="Eliminar" icon={PencilIcon} onClick={() => undefined} destructive />,
    );

    expect(screen.getByRole("button")).toHaveClass("hover:text-destructive");
  });
});

describe("ActivePill", () => {
  it("activo: «Activo» con un punto lleno", () => {
    render(<ActivePill active />);

    const pill = screen.getByText("Activo");
    expect(pill.firstElementChild).toHaveClass("bg-teal");
    expect(pill.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("desactivado: «Desactivado» con un aro gris", () => {
    render(<ActivePill active={false} />);

    expect(screen.getByText("Desactivado").firstElementChild).toHaveClass(
      "border-2",
      "border-neutral-dot",
      "bg-transparent",
    );
  });
});
