import { catalogRutas } from "@syc/contracts";
import { describe, expect, it, vi } from "vitest";

// La pantalla arrastra el cliente oRPC (que exige VITE_API_URL); acá solo importa la ruta.
vi.mock("@/features/catalogs/components/CatalogsAdmin", () => ({ CatalogsAdmin: () => null }));

import { Route } from "./catalogos";

type ValidateSearch = (search: Record<string, unknown>) => { catalogo?: string };

function validateSearch(): ValidateSearch {
  const validator = Route.options.validateSearch;
  if (!validator) throw new Error("La ruta no define validateSearch");
  // Es un esquema de Zod: se usa por su interfaz estándar, como hace el router.
  return (search) => {
    const result = (
      validator as unknown as {
        "~standard": { validate: (value: unknown) => { value: { catalogo?: string } } };
      }
    )["~standard"].validate(search);
    return result.value;
  };
}

describe("ruta /admin/catalogos", () => {
  it.each(catalogRutas)("conserva la pestaña ?catalogo=%s", (ruta) => {
    expect(validateSearch()({ catalogo: ruta })).toEqual({ catalogo: ruta });
  });

  it("sin parámetro o con uno desconocido no define pestaña (la pantalla abre en Áreas)", () => {
    expect(validateSearch()({}).catalogo).toBeUndefined();
    expect(validateSearch()({ catalogo: "otra-cosa" }).catalogo).toBeUndefined();
  });
});
