import { expect, test, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { challengeMatches } from "./device-login";

const verifier = "dBjftJeZ4CVP-mJ0kZ5TOqHxV0ErSnZ_1Mgx2nC4fP0";
const challenge = "4TexcNjc10dTZ8tpmZRyWUy_hqbqeoI25girlZndV_o";

test("matches the SHA-256 PKCE challenge", () => {
  expect(challengeMatches(verifier, challenge)).toBe(true);
});

test("rejects a different verifier", () => {
  expect(challengeMatches("a".repeat(43), challenge)).toBe(false);
});

test("rejects a challenge of another length without throwing", () => {
  expect(challengeMatches(verifier, "short")).toBe(false);
});
