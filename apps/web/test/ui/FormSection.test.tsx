import { render, screen } from "@testing-library/react";
import { Ticket } from "lucide-react";
import { describe, expect, it } from "vitest";
import { FormActionBar } from "@/components/common/FormActionBar";
import { FormSection, type SectionTone } from "@/components/common/FormSection";

describe("FormSection", () => {
  it("es una región con el título como nombre, la descripción y el contenido", () => {
    render(
      <FormSection id="s1" tone="brand" icon={Ticket} title="Datos" description="Qué se pidió.">
        <p>contenido</p>
      </FormSection>,
    );

    const region = screen.getByRole("region", { name: "Datos" });
    expect(region).toHaveTextContent("Qué se pidió.");
    expect(region).toHaveTextContent("contenido");
    expect(screen.getByRole("heading", { level: 2, name: "Datos" })).toHaveAttribute("id", "s1");
  });

  it("el ícono es decorativo: no se lee en voz alta", () => {
    const { container } = render(
      <FormSection id="s1" tone="teal" icon={Ticket} title="Datos" description="x">
        <p>contenido</p>
      </FormSection>,
    );

    expect(container.querySelector(".form-section-icon")).toHaveAttribute("aria-hidden", "true");
  });

  it.each([
    ["brand", "tone-brand"],
    ["amber", "tone-amber"],
    ["violet", "tone-violet"],
    ["teal", "tone-teal"],
    ["blue", "tone-blue"],
  ] as [SectionTone, string][])("el color %s usa la clase %s", (tone, className) => {
    render(
      <FormSection id="s1" tone={tone} icon={Ticket} title="Datos" description="x">
        <p>contenido</p>
      </FormSection>,
    );

    expect(screen.getByRole("region", { name: "Datos" })).toHaveClass("form-section", className);
  });

  it("acepta clases propias para repartir el ancho", () => {
    render(
      <FormSection
        id="s1"
        tone="amber"
        icon={Ticket}
        title="Datos"
        description="x"
        className="flex-[3_1_420px]"
      >
        <p>contenido</p>
      </FormSection>,
    );

    expect(screen.getByRole("region", { name: "Datos" })).toHaveClass("flex-[3_1_420px]");
  });
});

describe("FormActionBar", () => {
  it("muestra las acciones y, a la izquierda, el mensaje", () => {
    render(
      <FormActionBar message={<p>Cambios guardados.</p>}>
        <button type="button">Guardar</button>
      </FormActionBar>,
    );

    expect(screen.getByText("Cambios guardados.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("sin mensaje no deja un hueco", () => {
    const { container } = render(
      <FormActionBar>
        <button type="button">Guardar</button>
      </FormActionBar>,
    );

    expect(container.querySelector(".mr-auto")).toBeNull();
  });

  it("queda fija al pie de la ventana", () => {
    const { container } = render(
      <FormActionBar>
        <button type="button">Guardar</button>
      </FormActionBar>,
    );

    expect(container.firstElementChild).toHaveClass("sticky", "bottom-0");
  });
});
