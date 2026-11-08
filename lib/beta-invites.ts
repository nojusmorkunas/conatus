// Invitations from the Conatus developer to test an app before it is released.
// Every self-hosted server that updates runs this code, including for people
// who never chose Conatus themselves, so the pop-up goes only to the instance
// admin who installed it, stops once they answer it, and stops showing after
// its end date even on a server that stays on an old release. Settings keeps a
// quiet way to join for anyone who changes their mind. CONATUS_BETA_INVITES=0
// turns all of it off for the whole server. Nothing about the server or its
// accounts is sent anywhere: joining is a link.

export type BetaInvite = {
  // Stored on each account that answers it, so never reuse an id.
  id: string;
  // The Settings section's name.
  name: string;
  title: string;
  body: string;
  joinUrl: string;
  // Another way in for anyone who would rather not join the test itself.
  alternative: { text: string; linkLabel: string; url: string } | null;
  // The last day the invite can show, as YYYY-MM-DD in UTC.
  endsOn: string;
};

export const currentBetaInvite: BetaInvite | null = {
  id: "android-closed-beta-2026",
  name: "Android beta",
  title: "Help test Conatus for Android",
  body:
    "The Android app is in closed testing on Google Play and needs at least 12 testers before it can be published. " +
    "If you have an Android phone, joining takes a Google account and 14 days in the test. " +
    "The test app signs in to this server and works with your real tasks, so expect the odd bug.",
  joinUrl: "https://useconatus.com/android-beta/",
  alternative: {
    text: "Rather not use Google Play? The app is also on GitHub, and feedback is welcome either way.",
    linkLabel: "Get it from GitHub",
    url: "https://github.com/nojusmorkunas/conatus-android/releases/latest",
  },
  endsOn: "2027-02-28",
};

// The invite that is running on this server today, for anyone to join from
// Settings, whether or not they dismissed the pop-up.
export function activeBetaInvite(
  now = new Date(),
  invite = currentBetaInvite,
  env: Record<string, string | undefined> = process.env,
): BetaInvite | null {
  if (!invite) return null;
  if (env.CONATUS_BETA_INVITES === "0") return null;
  if (now.toISOString().slice(0, 10) > invite.endsOn) return null;
  return invite;
}

export type BetaInviteAudience = {
  instanceRole: string;
  onboardingCompletedAt: Date | null;
  dismissedBetaInvites: string[];
  betaInvitesOptOut: boolean;
};

// The invite to pop up for this account, if any.
export function betaInviteFor(
  account: BetaInviteAudience,
  invite = activeBetaInvite(),
): BetaInvite | null {
  if (!invite) return null;
  if (account.instanceRole !== "admin") return null;
  // The first-run flow shares the app layout; wait until it is done.
  if (!account.onboardingCompletedAt) return null;
  if (account.betaInvitesOptOut) return null;
  if (account.dismissedBetaInvites.includes(invite.id)) return null;
  return invite;
}
