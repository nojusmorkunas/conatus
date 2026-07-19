import { afterEach, describe, expect, it } from "vitest";

import { isOpenRegistrationEnabled, normalizeUsername } from "./registration";

const originalMode = process.env.REGISTRATION_MODE;

afterEach(() => {
  if (originalMode === undefined) delete process.env.REGISTRATION_MODE;
  else process.env.REGISTRATION_MODE = originalMode;
});

describe("registration policy helpers", () => {
  it("normalizes enrollment identities", () => {
    expect(normalizeUsername("  Admin.User ")).toBe("admin.user");
  });

  it("defaults to invite-only registration", () => {
    delete process.env.REGISTRATION_MODE;
    expect(isOpenRegistrationEnabled()).toBe(false);
  });

  it("allows an explicit open mode for disposable test deployments", () => {
    process.env.REGISTRATION_MODE = "OPEN";
    expect(isOpenRegistrationEnabled()).toBe(true);
  });
});
