import { describe, expect, test } from "vitest";

import { betaInviteFor, currentBetaInvite, type BetaInvite } from "./beta-invites";

const invite: BetaInvite = {
  id: "android-test",
  title: "Help test",
  body: "Body",
  joinUrl: "https://example.test/beta",
  endsOn: "2027-02-28",
};

const admin = {
  instanceRole: "admin",
  onboardingCompletedAt: new Date("2026-01-01T00:00:00Z"),
  seenBetaInvites: [] as string[],
  betaInvitesOptOut: false,
};

const now = new Date("2026-11-07T12:00:00Z");

describe("betaInviteFor", () => {
  test("shows an admin an invite they have not seen", () => {
    expect(betaInviteFor(admin, now, invite)).toBe(invite);
  });

  test("never shows members", () => {
    expect(betaInviteFor({ ...admin, instanceRole: "member" }, now, invite)).toBeNull();
  });

  test("waits until onboarding is done", () => {
    expect(betaInviteFor({ ...admin, onboardingCompletedAt: null }, now, invite)).toBeNull();
  });

  test("shows each invite once", () => {
    expect(betaInviteFor({ ...admin, seenBetaInvites: ["android-test"] }, now, invite)).toBeNull();
    expect(betaInviteFor({ ...admin, seenBetaInvites: ["older-invite"] }, now, invite)).toBe(invite);
  });

  test("respects the opt-out for this and every later invite", () => {
    const optedOut = { ...admin, betaInvitesOptOut: true };
    expect(betaInviteFor(optedOut, now, invite)).toBeNull();
    expect(betaInviteFor(optedOut, now, { ...invite, id: "ios-test" })).toBeNull();
  });

  test("stops after the last day, even on an old release", () => {
    expect(betaInviteFor(admin, new Date("2027-02-28T23:59:59Z"), invite)).toBe(invite);
    expect(betaInviteFor(admin, new Date("2027-03-01T00:00:00Z"), invite)).toBeNull();
  });

  test("shows nothing when there is no current invite", () => {
    expect(betaInviteFor(admin, now, null)).toBeNull();
  });

  test("the current invite has a valid end date", () => {
    if (!currentBetaInvite) return;
    expect(currentBetaInvite.endsOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new URL(currentBetaInvite.joinUrl).protocol).toBe("https:");
  });
});
