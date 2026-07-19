import "server-only";

export const oauthProviderNames = {
  github: "GitHub",
  google: "Google",
} as const;

export type OAuthProviderId = keyof typeof oauthProviderNames;

export function isOAuthProviderConfigured(provider: OAuthProviderId) {
  const prefix = provider.toUpperCase();
  return Boolean(
    process.env[`AUTH_${prefix}_ID`] &&
      process.env[`AUTH_${prefix}_SECRET`],
  );
}

export function getConfiguredOAuthProviders() {
  return (Object.keys(oauthProviderNames) as OAuthProviderId[])
    .filter(isOAuthProviderConfigured)
    .map((id) => ({ id, name: oauthProviderNames[id] }));
}

export function isOAuthProvider(provider: string): provider is OAuthProviderId {
  return Object.hasOwn(oauthProviderNames, provider);
}
