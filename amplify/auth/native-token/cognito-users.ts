import {
  AdminDeleteUserCommand,
  AdminLinkProviderForUserCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  type UserType,
} from "@aws-sdk/client-cognito-identity-provider";

/**
 * The small amount of admin work native sign-in needs, in one place.
 *
 * A user pool with `usernameAttributes: ["email"]` gives native accounts a
 * generated UUID for a username and treats the email as an alias, so anything
 * that has to name an existing account has to look it up by email first. That
 * lookup is the reason this file exists.
 */

/** One client per execution environment; creating one per call is pure latency. */
const client = new CognitoIdentityProviderClient({});

function attribute(user: UserType, name: string): string | undefined {
  return user.Attributes?.find((entry) => entry.Name === name)?.Value;
}

/**
 * A federated user carries an `identities` attribute naming the provider it
 * came from; a native (email or provider-token) user has none. The two are
 * otherwise indistinguishable, and telling them apart decides which account a
 * link should point at.
 */
export function isFederated(user: UserType): boolean {
  const identities = attribute(user, "identities");
  return Boolean(identities && identities !== "[]");
}

/**
 * Reads the provider identity off a federated user. Cognito stores it as a
 * JSON array in the `identities` attribute; the username prefix says the same
 * thing, but this is the copy Cognito itself uses when resolving a link.
 */
export function federatedIdentityOf(
  user: UserType,
): { providerName: string; subject: string } | null {
  const raw = attribute(user, "identities");
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const [first] = Array.isArray(parsed) ? parsed : [];
  const providerName = (first as { providerName?: unknown })?.providerName;
  const subject = (first as { userId?: unknown })?.userId;
  if (typeof providerName !== "string" || typeof subject !== "string") {
    return null;
  }
  return { providerName, subject };
}

export function customAttributesOf(user: UserType): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const entry of user.Attributes ?? []) {
    if (entry.Name?.startsWith("custom:") && entry.Value) {
      attributes[entry.Name] = entry.Value;
    }
  }
  return attributes;
}

/**
 * Cognito's ListUsers filter is a small query language, and the email goes
 * into it as a quoted literal. A quote or backslash in the value would end the
 * literal early, so an address carrying either is refused rather than escaped
 * — no real address contains them, and a filter that changes shape is not
 * something to guess about inside an auth trigger.
 */
export async function findUsersByEmail(
  userPoolId: string,
  email: string,
): Promise<UserType[]> {
  if (/["\\]/.test(email)) {
    throw new Error("Email address cannot be used in a user lookup.");
  }
  const { Users } = await client.send(
    new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${email}"`,
      Limit: 10,
    }),
  );
  return Users ?? [];
}

/**
 * Splits the username Cognito generates for a federated user
 * (`SignInWithApple_000123.abc`, `Google_11002233`) into the two halves a link
 * needs. Apple subjects contain dots and Google's are digits, but neither
 * contains an underscore, so the first one is the separator.
 */
export function splitFederatedUsername(
  username: string,
): { providerName: string; subject: string } | null {
  const separator = username.indexOf("_");
  if (separator <= 0 || separator === username.length - 1) return null;
  return {
    providerName: username.slice(0, separator),
    subject: username.slice(separator + 1),
  };
}

/**
 * Points a provider identity at an existing native account, so a later hosted
 * UI sign-in with that provider lands on the same user instead of creating a
 * second one. This is what keeps web (which still goes through the hosted UI)
 * and mobile (which does not) on one account.
 */
export async function linkFederatedIdentity(params: {
  userPoolId: string;
  nativeUsername: string;
  providerName: string;
  subject: string;
}): Promise<void> {
  await client.send(
    new AdminLinkProviderForUserCommand({
      UserPoolId: params.userPoolId,
      DestinationUser: {
        ProviderName: "Cognito",
        ProviderAttributeValue: params.nativeUsername,
      },
      SourceUser: {
        ProviderName: params.providerName,
        ProviderAttributeName: "Cognito_Subject",
        ProviderAttributeValue: params.subject,
      },
    }),
  );
}

export async function copyCustomAttributes(params: {
  userPoolId: string;
  username: string;
  attributes: Record<string, string>;
}): Promise<void> {
  const entries = Object.entries(params.attributes);
  if (entries.length === 0) return;
  await client.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: params.userPoolId,
      Username: params.username,
      UserAttributes: entries.map(([Name, Value]) => ({ Name, Value })),
    }),
  );
}

export async function deleteUser(
  userPoolId: string,
  username: string,
): Promise<void> {
  await client.send(
    new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: username }),
  );
}
