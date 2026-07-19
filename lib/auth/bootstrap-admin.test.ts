import { describe, expect, it } from "vitest";

import { readBootstrapAdminConfig } from "./bootstrap-admin";

describe("bootstrap administrator configuration", () => {
  it("is disabled when neither credential is configured", () => {
    expect(readBootstrapAdminConfig({})).toBeNull();
  });

  it("normalizes valid credentials", () => {
    expect(
      readBootstrapAdminConfig({
        CONATUS_ADMIN_USERNAME: "  Admin.User ",
        CONATUS_ADMIN_PASSWORD: "correct horse battery staple",
      }),
    ).toEqual({
      username: "admin.user",
      password: "correct horse battery staple",
    });
  });

  it("requires both variables", () => {
    expect(() =>
      readBootstrapAdminConfig({ CONATUS_ADMIN_USERNAME: "admin" }),
    ).toThrow(/must be set together/);
  });

  it("rejects invalid usernames and short passwords", () => {
    expect(() =>
      readBootstrapAdminConfig({
        CONATUS_ADMIN_USERNAME: "not valid",
        CONATUS_ADMIN_PASSWORD: "password123",
      }),
    ).toThrow(/3-32 characters/);
    expect(() =>
      readBootstrapAdminConfig({
        CONATUS_ADMIN_USERNAME: "admin",
        CONATUS_ADMIN_PASSWORD: "short",
      }),
    ).toThrow(/at least 8/);
  });
});
