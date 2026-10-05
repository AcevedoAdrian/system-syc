import { afterEach, describe, expect, it, vi } from "vitest";
import { notDeleted, softDeleteData } from "./soft-delete";

describe("soft-delete", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("notDeleted filtra los registros con deletedAt nulo", () => {
    expect(notDeleted).toEqual({ deletedAt: null });
  });

  it("softDeleteData setea deletedAt (ahora) y updatedBy (el actor)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T12:00:00.000Z"));

    expect(softDeleteData("admin-1")).toEqual({
      deletedAt: new Date("2026-10-05T12:00:00.000Z"),
      updatedBy: "admin-1",
    });
  });
});
