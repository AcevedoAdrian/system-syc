import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const items = vi.hoisted(() => [
  { id: "1", nombre: "Baja", orden: 1, activo: true },
  { id: "2", nombre: "Media", orden: 2, activo: false },
  { id: "3", nombre: "Alta", orden: 3, activo: true },
  { id: "4", nombre: "Urgente", orden: 4, activo: false },
  { id: "5", nombre: "Crítica", orden: 5, activo: true },
]);

vi.mock("@/lib/orpc-client", () => ({
  orpc: {
    catalogs: {
      prioridades: {
        key: () => ["catalogs", "prioridades"],
        list: {
          queryOptions: () => ({
            queryKey: ["catalogs", "prioridades", "list"],
            queryFn: async () => items,
          }),
        },
      },
    },
  },
}));

import { useCatalog } from "./useCatalog";
import { useCatalogOptions } from "./useCatalogOptions";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useCatalogOptions", () => {
  it("devuelve solo los activos, en el mismo orden que useCatalog", async () => {
    const options = renderHook(() => useCatalogOptions("prioridades"), { wrapper });
    const all = renderHook(() => useCatalog("prioridades"), { wrapper });

    await waitFor(() => expect(options.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(all.result.current.isSuccess).toBe(true));

    expect(options.result.current.data?.map((item) => item.nombre)).toEqual([
      "Baja",
      "Alta",
      "Crítica",
    ]);
    expect(all.result.current.data?.map((item) => item.nombre)).toEqual([
      "Baja",
      "Media",
      "Alta",
      "Urgente",
      "Crítica",
    ]);
  });
});
