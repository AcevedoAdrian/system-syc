import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginError } from "../login-error";

const mutate = vi.fn();
let mutationState: { error: Error | null; isPending: boolean } = { error: null, isPending: false };

vi.mock("../hooks/useLogin", () => ({
  useLogin: () => ({ mutate, ...mutationState }),
}));

import { LoginForm } from "./LoginForm";

describe("LoginForm", () => {
  beforeEach(() => {
    mutate.mockReset();
    mutationState = { error: null, isPending: false };
  });

  it("no envía con campos vacíos", async () => {
    render(<LoginForm onSuccess={() => undefined} />);

    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByText("Ingresá tu usuario.")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("envía usuario y contraseña", async () => {
    render(<LoginForm onSuccess={() => undefined} />);

    await userEvent.type(screen.getByLabelText("Usuario"), "ana");
    await userEvent.type(screen.getByLabelText("Contraseña"), "clave-1234");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(mutate.mock.calls[0]?.[0]).toEqual({ username: "ana", password: "clave-1234" });
  });

  it("marca los dos campos vacíos y los enlaza con su mensaje", async () => {
    render(<LoginForm onSuccess={() => undefined} />);

    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    const username = screen.getByLabelText("Usuario");
    const password = screen.getByLabelText("Contraseña");
    expect(username).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(username).toHaveAccessibleDescription("Ingresá tu usuario.");
    expect(password).toHaveAccessibleDescription("Ingresá tu contraseña.");
  });

  it.each([
    ["invalid", "Usuario o contraseña incorrectos.", "Revisá los datos e intentá de nuevo."],
    ["rate-limited", "Demasiados intentos.", "Esperá un minuto antes de volver a intentar."],
    ["disabled", "Tu usuario está desactivado.", "Pedí a un administrador que lo reactive."],
  ] as const)("muestra el aviso de %s con título y detalle", (failure, title, detail) => {
    mutationState = { error: new LoginError(failure), isPending: false };

    render(<LoginForm onSuccess={() => undefined} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(`${title} ${detail}`);
  });

  it("muestra el aviso de servidor inalcanzable sin detalle", () => {
    mutationState = { error: new LoginError("unreachable"), isPending: false };

    render(<LoginForm onSuccess={() => undefined} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/^No se pudo conectar con el servidor\.$/);
  });

  it("no muestra aviso si no hubo error", () => {
    render(<LoginForm onSuccess={() => undefined} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("alterna la contraseña entre oculta y visible", async () => {
    render(<LoginForm onSuccess={() => undefined} />);
    const password = screen.getByLabelText("Contraseña");
    expect(password).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: "Mostrar contraseña" }));

    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Ocultar contraseña" })).toHaveTextContent("Ocultar");

    await userEvent.click(screen.getByRole("button", { name: "Ocultar contraseña" }));

    expect(password).toHaveAttribute("type", "password");
  });

  it("mostrar la contraseña no envía el formulario", async () => {
    render(<LoginForm onSuccess={() => undefined} />);

    await userEvent.click(screen.getByRole("button", { name: "Mostrar contraseña" }));

    expect(mutate).not.toHaveBeenCalled();
  });

  it("mientras envía, el botón dice «Ingresando…» y está deshabilitado", () => {
    mutationState = { error: null, isPending: true };

    render(<LoginForm onSuccess={() => undefined} />);

    expect(screen.getByRole("button", { name: "Ingresando…" })).toBeDisabled();
  });

  it("tiene un título «Iniciar sesión» que nombra la sección", () => {
    render(<LoginForm onSuccess={() => undefined} />);

    expect(screen.getByRole("heading", { level: 1, name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Iniciar sesión" })).toBeInTheDocument();
  });
});
