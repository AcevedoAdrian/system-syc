import { describe, expect, it } from "vitest";
import { Route } from "./index";

describe("ruta / (autenticada)", () => {
  it("redirige a la lista de tickets: no tiene contenido propio", () => {
    const { beforeLoad } = Route.options;
    if (typeof beforeLoad !== "function") throw new Error("La ruta / no define beforeLoad");

    expect(() => beforeLoad({} as never)).toThrowError(
      expect.objectContaining({ options: expect.objectContaining({ to: "/tickets" }) }),
    );
  });
});
