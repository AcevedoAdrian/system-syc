import { describe, expect, it } from "vitest";
import { isAllowedAuthRequest } from "./auth.handler";

describe("isAllowedAuthRequest (allowlist de Better Auth)", () => {
  it.each([
    ["POST", "/api/auth/sign-in/username"],
    ["POST", "/api/auth/sign-out"],
    ["GET", "/api/auth/get-session"],
    ["POST", "/api/auth/change-password"],
  ])("permite %s %s", (method, path) => {
    expect(isAllowedAuthRequest(method, path)).toBe(true);
  });

  it.each([
    ["POST", "/api/auth/admin/create-user"],
    ["POST", "/api/auth/admin/set-role"],
    ["GET", "/api/auth/admin/list-users"],
    ["POST", "/api/auth/organization/create"],
    ["POST", "/api/auth/sign-up/email"],
    ["POST", "/api/auth/sign-in/email"],
    ["POST", "/api/auth/reset-password"],
    ["GET", "/api/auth/sign-in/username"],
    ["POST", "/api/auth/get-session"],
    ["GET", "/api/auth/get-session/extra"],
    ["GET", "/api/auth/"],
    ["GET", "/api/auth"],
  ])("rechaza %s %s", (method, path) => {
    expect(isAllowedAuthRequest(method, path)).toBe(false);
  });

  it("no depende de cómo venga escrito el método", () => {
    expect(isAllowedAuthRequest("post", "/api/auth/sign-out")).toBe(true);
    expect(isAllowedAuthRequest(undefined, "/api/auth/sign-out")).toBe(false);
  });
});
