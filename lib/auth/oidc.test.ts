import { describe, expect, it } from "vitest";

import { usernameFromClaims } from "./oidc";

describe("usernameFromClaims", () => {
  it("prefers a valid preferred_username, lowercased", () => {
    expect(usernameFromClaims({ preferred_username: "Alice", email: "bob@example.com" })).toBe("alice");
  });

  it("falls back to the email local part, then to user", () => {
    expect(usernameFromClaims({ preferred_username: "alice@example.com", email: "alice.b@example.com" })).toBe("alice.b");
    expect(usernameFromClaims({ preferred_username: "Alice Smith" })).toBe("user");
  });
});
