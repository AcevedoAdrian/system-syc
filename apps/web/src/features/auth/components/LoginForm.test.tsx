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

  it.each([
    ["invalid", "Usuario o contraseña incorrectos."],
    ["rate-limited", "Demasiados intentos. Esperá un minuto antes de volver a intentar."],
    ["disabled", "Tu usuario está desactivado. Consultá con un administrador."],
  ] as const)("muestra el mensaje de %s", (failure, message) => {
    mutationState = { error: new LoginError(failure), isPending: false };

    render(<LoginForm onSuccess={() => undefined} />);

    expect(screen.getByRole("alert")).toHaveTextContent(message);
  });
});
