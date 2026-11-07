// Invitations from the Conatus developer to test an app before it is released.
// Every self-hosted server that updates runs this code, including for people
// who never chose Conatus themselves, so an invite goes only to the instance
// admin who installed it, shows once, and stops showing after its end date even
// on a server that stays on an old release. The banner only links out: nothing
// about the server or its accounts is sent anywhere.

export type BetaInvite = {
  // Stored on each account that has seen it, so never reuse an id.
  id: string;
  title: string;
  body: string;
  joinUrl: string;
  // The last day the invite can show, as YYYY-MM-DD in UTC.
  endsOn: string;
};

export const currentBetaInvite: BetaInvite | null = {
  id: "android-closed-beta-2026",
  title: "Help test Conatus for Android",
  body:
    "The Android app is in closed testing on Google Play and needs at least 12 testers before it can be published. " +
    "If you have an Android phone, joining takes a Google account and 14 days in the test. " +
    "The test app signs in to this server and works with your real tasks, so expect the odd bug.",
  joinUrl: "https://useconatus.com/android-beta/",
  endsOn: "2027-02-28",
};

export type BetaInviteAudience = {
  instanceRole: string;
  onboardingCompletedAt: Date | null;
  seenBetaInvites: string[];
  betaInvitesOptOut: boolean;
};

export function betaInviteFor(
  account: BetaInviteAudience,
  now = new Date(),
  invite = currentBetaInvite,
): BetaInvite | null {
  if (!invite) return null;
  if (account.instanceRole !== "admin") return null;
  // The first-run flow shares the app layout; wait until it is done.
  if (!account.onboardingCompletedAt) return null;
  if (account.betaInvitesOptOut) return null;
  if (account.seenBetaInvites.includes(invite.id)) return null;
  if (now.toISOString().slice(0, 10) > invite.endsOn) return null;
  return invite;
}
