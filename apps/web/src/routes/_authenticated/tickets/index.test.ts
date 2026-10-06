import { describe, expect, it, vi } from "vitest";

// La pantalla arrastra el cliente oRPC (que exige VITE_API_URL); acá solo importa la ruta.
vi.mock("@/features/tickets/components/TicketsList", () => ({ TicketsList: () => null }));

import { Route } from "./index";

function validateSearch(search: Record<string, unknown>): Record<string, unknown> {
  const validator = Route.options.validateSearch;
  if (!validator) throw new Error("La ruta no define validateSearch");
  // Es un esquema de Zod: se usa por su interfaz estándar, como hace el router.
  return (
    validator as unknown as {
      "~standard": { validate: (value: unknown) => { value: Record<string, unknown> } };
    }
  )["~standard"].validate(search).value;
}

describe("ruta /tickets", () => {
  it("recargar /tickets?q=impresora&page=2 conserva la misma búsqueda y página", () => {
    expect(validateSearch({ q: "impresora", page: 2 })).toEqual({ q: "impresora", page: 2 });
  });

  it("un valor inválido de la URL se descarta, no rompe la bandeja", () => {
    expect(validateSearch({ page: "abc", fechaRecepcionDesde: "ayer", areaId: "a1" })).toEqual({
      areaId: "a1",
    });
  });
});
