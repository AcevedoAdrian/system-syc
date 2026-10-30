import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Ticket } from "lucide-react";
import { describe, expect, it } from "vitest";
import { Field, TodayButton } from "@/components/common/Field";

function renderField(props: Partial<Parameters<typeof Field>[0]> = {}) {
  return render(
    <Field id="titulo" label="Título" {...props}>
      {(control) => <input id="titulo" {...control} />}
    </Field>,
  );
}

describe("Field", () => {
  it("liga la etiqueta al control", () => {
    renderField();

    expect(screen.getByLabelText("Título")).toBe(screen.getByRole("textbox"));
  });

  it("sin error, ayuda ni obligatorio no agrega ningún atributo al control", () => {
    renderField();

    const input = screen.getByRole("textbox");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(input).not.toHaveAttribute("aria-required");
  });

  it("el error queda ligado al control para que el lector de pantalla lo lea al entrar", () => {
    renderField({ error: "El título es obligatorio." });

    const input = screen.getByRole("textbox");
    const error = screen.getByText("El título es obligatorio.");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(error.id).toBe("titulo-error");
    expect(input).toHaveAccessibleDescription("El título es obligatorio.");
  });

  it("la ayuda también, y con ayuda y error el control los lee a los dos (la ayuda primero)", () => {
    renderField({ hint: "Elegí un proveedor.", error: "Formato inválido." });

    expect(screen.getByRole("textbox")).toHaveAccessibleDescription(
      "Elegí un proveedor. Formato inválido.",
    );
    expect(screen.getByText("Elegí un proveedor.").id).toBe("titulo-hint");
  });

  it("la ayuda sin error no marca el campo como inválido", () => {
    renderField({ hint: "Elegí un proveedor." });

    const input = screen.getByRole("textbox");
    expect(input).toHaveAccessibleDescription("Elegí un proveedor.");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("un campo obligatorio se marca con un asterisco que no forma parte de su nombre", () => {
    renderField({ required: true });

    const input = screen.getByRole("textbox", { name: "Título" });
    expect(input).toHaveAttribute("aria-required", "true");
    const asterisk = screen.getByText("*");
    expect(asterisk).toHaveAttribute("aria-hidden", "true");
  });

  it("un campo opcional no lleva asterisco", () => {
    renderField();

    expect(screen.queryByText("*")).not.toBeInTheDocument();
  });

  it("el ícono de la etiqueta es decorativo y no cambia el nombre del campo", () => {
    renderField({ icon: Ticket });

    expect(screen.getByRole("textbox", { name: "Título" })).toBeInTheDocument();
    expect(document.querySelector("label svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("el contador muestra n/máx, y no se lee en voz alta", () => {
    renderField({ counter: { value: 12, max: 200 } });

    const contador = screen.getByText("12/200");
    expect(contador).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("textbox")).not.toHaveAccessibleDescription("12/200");
  });

  it("sin contador no muestra nada", () => {
    renderField();

    expect(screen.queryByText(/\d+\/\d+/)).not.toBeInTheDocument();
  });

  it("una acción va junto a la etiqueta, fuera de ella", () => {
    renderField({ action: <button type="button">Usar hoy</button> });

    expect(screen.getByRole("button", { name: "Usar hoy" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Título" })).toBeInTheDocument();
  });

  it("un campo modificado lo dice en su descripción, para el lector de pantalla", () => {
    renderField({ modified: true });

    const input = screen.getByRole("textbox", { name: "Título" });
    expect(input).toHaveAccessibleDescription("Modificado.");
    expect(screen.getByText("Modificado.").id).toBe("titulo-modified");
  });

  it("«Modificado.» se lee después de la ayuda y del error", () => {
    renderField({ modified: true, hint: "Elegí un proveedor.", error: "Formato inválido." });

    expect(screen.getByRole("textbox")).toHaveAccessibleDescription(
      "Elegí un proveedor. Formato inválido. Modificado.",
    );
  });

  it("un campo modificado se marca con un punto decorativo y la clase que lo tiñe", () => {
    const { container } = renderField({ modified: true });

    expect(container.firstElementChild).toHaveClass("field-modified");
    expect(document.querySelector("label ~ [aria-hidden='true'].rounded-full")).toBeInTheDocument();
  });

  it("modificado no marca el campo como inválido", () => {
    renderField({ modified: true });

    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
  });

  it("sin modificar no hay marca, ni punto, ni nada en la descripción", () => {
    const { container } = renderField();

    expect(container.firstElementChild).not.toHaveClass("field-modified");
    expect(screen.queryByText("Modificado.")).not.toBeInTheDocument();
    expect(document.querySelector(".rounded-full")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-describedby");
  });
});

describe("TodayButton", () => {
  it("es un botón «Usar hoy» que no envía el formulario", async () => {
    let clicks = 0;
    render(
      <form onSubmit={(e) => e.preventDefault()}>
        <TodayButton onClick={() => (clicks += 1)} />
      </form>,
    );

    const boton = screen.getByRole("button", { name: "Usar hoy" });
    expect(boton).toHaveAttribute("type", "button");
    await userEvent.click(boton);

    expect(clicks).toBe(1);
  });
});
