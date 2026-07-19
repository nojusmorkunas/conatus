import { expect, test } from "vitest";

import { generateAgentToken, generateToken, hashToken } from "./api-token";

test("generates tokens with the expected format and prefix", () => {
  const token = generateToken();

  expect(token.raw).toMatch(/^tdc_[A-Za-z0-9_-]{32}$/);
  expect(token.prefix).toBe(token.raw.slice(0, 12));
  expect(token.hash).toBe(hashToken(token.raw));
});

test("hashes tokens deterministically", () => {
  expect(hashToken("tdc_example")).toBe(hashToken("tdc_example"));
});

test("generates distinct tokens", () => {
  const first = generateToken();
  const second = generateToken();

  expect(first.raw).not.toBe(second.raw);
  expect(first.hash).not.toBe(second.hash);
});

test("generates scoped agent tokens with a distinct prefix", () => {
  const token = generateAgentToken();

  expect(token.raw).toMatch(/^tdm_[A-Za-z0-9_-]{32}$/);
  expect(token.prefix).toBe(token.raw.slice(0, 12));
  expect(token.hash).toBe(hashToken(token.raw));
});
