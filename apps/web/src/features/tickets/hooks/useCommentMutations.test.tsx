import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ create: vi.fn(), remove: vi.fn() }));

// Un cliente oRPC mínimo: cada procedimiento con su `key` (lo que se invalida) y su `mutationOptions`.
vi.mock("@/lib/orpc-client", () => {
  const key = (path: string[]) => (options?: { input?: unknown }) =>
    options?.input === undefined ? path : [...path, options.input];
  const mutation =
    (fn: (input: unknown) => unknown) =>
    (options: Record<string, unknown> = {}) => ({ mutationFn: fn, ...options });
  return {
    orpc: {
      comments: {
        list: { key: key(["comments", "list"]) },
        create: { mutationOptions: mutation((input) => api.create(input)) },
        remove: { mutationOptions: mutation((input) => api.remove(input)) },
      },
      tickets: {
        get: { key: key(["tickets", "get"]) },
        list: { key: key(["tickets", "list"]) },
        history: { key: key(["tickets", "history"]) },
      },
    },
  };
});

import { useCreateComment, useRemoveComment } from "./useCommentMutations";

function setup<T>(useHook: () => T) {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { ...renderHook(useHook, { wrapper }), invalidate };
}

const keysOf = (invalidate: { mock: { calls: unknown[][] } }) =>
  invalidate.mock.calls.map(([filters]) => (filters as { queryKey: unknown }).queryKey);

const AFTER_A_COMMENT = [
  ["comments", "list", { ticketId: "t-13" }],
  ["tickets", "history", { ticketId: "t-13" }],
  ["tickets", "list"],
];

describe("mutaciones de comentarios", () => {
  beforeEach(() => {
    api.create.mockReset();
    api.remove.mockReset();
    api.create.mockResolvedValue({ id: "c1" });
    api.remove.mockResolvedValue(undefined);
  });

  it("comentar invalida los comentarios del ticket, su historial y la bandeja, pero no el ticket", async () => {
    const { result, invalidate } = setup(useCreateComment);

    await result.current.mutateAsync({ ticketId: "t-13", texto: "Hola" });

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(3));
    expect(keysOf(invalidate)).toEqual(AFTER_A_COMMENT);
    expect(keysOf(invalidate)).not.toContainEqual(["tickets", "get", { ticketId: "t-13" }]);
    expect(keysOf(invalidate)).not.toContainEqual(["tickets"]);
  });

  it("eliminar invalida lo mismo, del ticket del comentario", async () => {
    const { result, invalidate } = setup(useRemoveComment);

    await result.current.mutateAsync({ ticketId: "t-13", comentarioId: "c1" });

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(3));
    expect(keysOf(invalidate)).toEqual(AFTER_A_COMMENT);
  });

  it("si la API rechaza, no invalida nada", async () => {
    api.create.mockRejectedValue(new Error("falló"));
    const { result, invalidate } = setup(useCreateComment);

    await expect(result.current.mutateAsync({ ticketId: "t-13", texto: "Hola" })).rejects.toThrow();

    expect(invalidate).not.toHaveBeenCalled();
  });
});
