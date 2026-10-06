import { ORPCError } from "@orpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchTicket = vi.hoisted(() => vi.fn());
vi.mock("@/lib/orpc-client", () => ({
  orpc: {
    tickets: {
      get: {
        queryOptions: ({ input }: { input: { ticketId: string } }) => ({
          queryKey: ["tickets", "get", input.ticketId],
          queryFn: () => fetchTicket(input.ticketId),
        }),
      },
    },
  },
}));

import { useTicket } from "./useTicket";

// Un cliente por test, creado una sola vez (no en cada render). Sin `retry` propio: lo que se prueba es
// el del hook, que pisa el del cliente.
function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useTicket("t1"), { wrapper });
}

describe("useTicket", () => {
  beforeEach(() => {
    // Con llaves: un `beforeEach` que devuelve una función la ejecuta como limpieza posterior.
    fetchTicket.mockReset();
  });

  it("no reintenta un 404: ajeno, inexistente o eliminado, reintentar solo demora el aviso", async () => {
    fetchTicket.mockRejectedValue(new ORPCError("NOT_FOUND", { status: 404 }));

    const { result } = setup();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchTicket).toHaveBeenCalledTimes(1);
  });

  it("no reintenta un 401: lo resuelve el manejador global", async () => {
    fetchTicket.mockRejectedValue(new ORPCError("UNAUTHORIZED", { status: 401 }));

    const { result } = setup();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchTicket).toHaveBeenCalledTimes(1);
  });

  it("sí reintenta un error de red, hasta 3 veces", async () => {
    fetchTicket.mockRejectedValue(new Error("network"));

    const { result } = setup();

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 });
    expect(fetchTicket).toHaveBeenCalledTimes(4); // la primera y 3 reintentos
  });

  it("devuelve el ticket pedido", async () => {
    fetchTicket.mockResolvedValue({ id: "t1", numero: 13 });

    const { result } = setup();

    await waitFor(() => expect(result.current.data).toEqual({ id: "t1", numero: 13 }));
    expect(fetchTicket).toHaveBeenCalledWith("t1");
  });
});
