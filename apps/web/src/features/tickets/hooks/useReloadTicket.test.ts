import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useReloadTicket } from "./useReloadTicket";

describe("useReloadTicket", () => {
  it("vuelve a leer el ticket y, si pudo, termina", async () => {
    const onReload = vi.fn().mockResolvedValue(undefined);
    const onDone = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useReloadTicket(onReload, onDone, onError));

    await act(() => result.current.reload());

    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.reloading).toBe(false);
  });

  it("mientras lee está recargando, y al terminar vuelve a estar libre", async () => {
    let finish: () => void = () => undefined;
    const onReload = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useReloadTicket(onReload, vi.fn(), vi.fn()));

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.reload();
    });
    expect(result.current.reloading).toBe(true);

    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.reloading).toBe(false);
  });

  it("si no puede leer, avisa con un mensaje y no termina, para poder reintentar", async () => {
    const onReload = vi.fn().mockRejectedValue(new Error("sin red"));
    const onDone = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useReloadTicket(onReload, onDone, onError));

    await act(() => result.current.reload());

    expect(onError).toHaveBeenCalledWith("No se pudo completar la operación. Intentá de nuevo.");
    expect(onDone).not.toHaveBeenCalled();
    expect(result.current.reloading).toBe(false);
  });
});
