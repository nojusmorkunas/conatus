import { describe, expect, test } from "vitest";

import { signWebhookBody } from "./webhook-signature";

describe("signWebhookBody", () => {
  test.each([
    ["secret", "{\"type\":\"task.created\"}", "b2dfe67aa861d321bfaf190b33755305bc24fec960dd06f7feac9f0f33e926eb"],
    ["another-secret", "{\"type\":\"task.created\"}", "159971988ff61763b07c91024915a1dec1feb6576267c051da0e8f17e01047ae"],
    ["secret", "{\"type\":\"task.deleted\"}", "f757a029b88da9fb87f2747cdda753fd03dc6314f28e90644c44b92bcb94359d"],
  ])("returns a deterministic HMAC for %s and %s", (secret, body, expected) => {
    expect(signWebhookBody(secret, body)).toBe(expected);
  });
});
