import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field } from "./Field";

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
});
