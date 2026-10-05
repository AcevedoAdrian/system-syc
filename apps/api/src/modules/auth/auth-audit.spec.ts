import { APIError } from "better-auth/api";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import { changedPasswordUserId } from "./auth.config";
import { auditPasswordChanged } from "./auth-audit";

describe("changedPasswordUserId (hook after de /change-password)", () => {
  it("devuelve el id del usuario cuando la respuesta es un éxito", () => {
    expect(changedPasswordUserId({ token: "t", user: { id: "u1", email: "a@b.c" } })).toBe("u1");
    expect(changedPasswordUserId({ token: null, user: { id: "u2" } })).toBe("u2");
  });

  it("devuelve null ante un APIError (contraseña actual incorrecta)", () => {
    expect(
      changedPasswordUserId(APIError.from("BAD_REQUEST", { code: "X", message: "x" })),
    ).toBeNull();
  });

  it.each([[undefined], [null], ["texto"], [{}], [{ user: {} }], [{ user: { id: 3 } }]])(
    "devuelve null ante una respuesta sin usuario (%j)",
    (returned) => {
      expect(changedPasswordUserId(returned)).toBeNull();
    },
  );
});

describe("auditPasswordChanged", () => {
  it("deja change_password con el propio usuario como actor y payload vacío", async () => {
    const log = vi.fn(async () => undefined);

    await auditPasswordChanged({ log } as unknown as AuditService)("u1");

    expect(log).toHaveBeenCalledWith({
      entityType: "User",
      entityId: "u1",
      action: "change_password",
      actorId: "u1",
      payload: {},
    });
  });

  it("si falla la escritura, el error sube", async () => {
    const log = vi.fn(async () => {
      throw new Error("falló la auditoría");
    });

    await expect(auditPasswordChanged({ log } as unknown as AuditService)("u1")).rejects.toThrow(
      "falló la auditoría",
    );
  });
});
