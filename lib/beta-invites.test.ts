import { describe, expect, test } from "vitest";

import { activeBetaInvite, betaInviteFor, currentBetaInvite, type BetaInvite } from "./beta-invites";

const invite: BetaInvite = {
  id: "android-test",
  name: "Android beta",
  title: "Help test",
  body: "Body",
  joinUrl: "https://example.test/beta",
  alternative: null,
  endsOn: "2027-02-28",
};

const admin = {
  instanceRole: "admin",
  onboardingCompletedAt: new Date("2026-01-01T00:00:00Z"),
  dismissedBetaInvites: [] as string[],
  betaInvitesOptOut: false,
};

const now = new Date("2026-11-07T12:00:00Z");

describe("activeBetaInvite", () => {
  test("runs until its last day, even on an old release", () => {
    expect(activeBetaInvite(now, invite, {})).toBe(invite);
    expect(activeBetaInvite(new Date("2027-02-28T23:59:59Z"), invite, {})).toBe(invite);
    expect(activeBetaInvite(new Date("2027-03-01T00:00:00Z"), invite, {})).toBeNull();
  });

  test("CONATUS_BETA_INVITES=0 turns it off for the server", () => {
    expect(activeBetaInvite(now, invite, { CONATUS_BETA_INVITES: "0" })).toBeNull();
    expect(activeBetaInvite(now, invite, { CONATUS_BETA_INVITES: "1" })).toBe(invite);
  });

  test("is null when there is no invite", () => {
    expect(activeBetaInvite(now, null, {})).toBeNull();
  });

  test("the current invite is well formed", () => {
    if (!currentBetaInvite) return;
    expect(currentBetaInvite.endsOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new URL(currentBetaInvite.joinUrl).protocol).toBe("https:");
  });
});

describe("betaInviteFor", () => {
  test("pops up for an admin who has not answered it", () => {
    expect(betaInviteFor(admin, invite)).toBe(invite);
  });

  test("never pops up for members", () => {
    expect(betaInviteFor({ ...admin, instanceRole: "member" }, invite)).toBeNull();
  });

  test("waits until onboarding is done", () => {
    expect(betaInviteFor({ ...admin, onboardingCompletedAt: null }, invite)).toBeNull();
  });

  test("pops up once per invite", () => {
    expect(betaInviteFor({ ...admin, dismissedBetaInvites: ["android-test"] }, invite)).toBeNull();
    expect(betaInviteFor({ ...admin, dismissedBetaInvites: ["older-invite"] }, invite)).toBe(invite);
  });

  test("respects the opt-out for this and every later invite", () => {
    const optedOut = { ...admin, betaInvitesOptOut: true };
    expect(betaInviteFor(optedOut, invite)).toBeNull();
    expect(betaInviteFor(optedOut, { ...invite, id: "ios-test" })).toBeNull();
  });

  test("pops up nothing when no invite is running", () => {
    expect(betaInviteFor(admin, null)).toBeNull();
  });
});
