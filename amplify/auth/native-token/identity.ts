import type { UserType } from "@aws-sdk/client-cognito-identity-provider";

import { PROVIDER_IDS_ATTRIBUTE } from "./config";

/**
 * Reading and extending the set of provider identities an account answers to.
 *
 * Stored as one space-separated attribute rather than a row per identity,
 * because Cognito has no such row: an account's attributes are the only place
 * a pool will keep this, and the list is two entries long at most in practice.
 */

export function parseIdentities(value: string | undefined): string[] {
  return (value ?? "").split(" ").filter(Boolean);
}

export function identitiesOf(user: UserType): string[] {
  const value = user.Attributes?.find(
    (entry) => entry.Name === PROVIDER_IDS_ATTRIBUTE,
  )?.Value;
  return parseIdentities(value);
}

export function providerOf(identity: string): string {
  return identity.split("|")[0] ?? "";
}

/**
 * Whether `identity` may be added to an account that already answers to
 * `existing`, and the result of doing so.
 *
 * Already present: nothing to do. A different provider: fine, one person, two
 * sheets. A *second subject for a provider already listed* is the case this
 * exists to refuse — the account was built for one Apple or Google user and
 * something is now presenting another, which is what a reassigned email
 * address looks like from here.
 */
export function withIdentity(
  existing: string[],
  identity: string,
): { identities: string[]; changed: boolean } {
  if (existing.includes(identity)) {
    return { identities: existing, changed: false };
  }
  const provider = providerOf(identity);
  if (existing.some((entry) => providerOf(entry) === provider)) {
    throw new Error(
      `This account is already linked to a different ${provider} user.`,
    );
  }
  return { identities: [...existing, identity], changed: true };
}
