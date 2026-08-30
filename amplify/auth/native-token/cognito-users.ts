import {
  AdminCreateUserCommand,
  AdminLinkProviderForUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  type UserType,
} from "@aws-sdk/client-cognito-identity-provider";

import { randomBytes } from "node:crypto";

import { PROVIDER_IDS_ATTRIBUTE } from "./config";

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

/**
 * Creates the account a provider token has just proved someone owns.
 *
 * The password is generated here and never leaves: sign-in goes through the
 * provider, and the account should not also have a password anybody — the
 * device included — could type. `AdminSetUserPassword` with `Permanent` is
 * what moves the account out of FORCE_CHANGE_PASSWORD, which cannot start a
 * custom auth flow.
 */
export async function createNativeUser(params: {
  userPoolId: string;
  email: string;
  identity: string;
}): Promise<void> {
  await client.send(
    new AdminCreateUserCommand({
      UserPoolId: params.userPoolId,
      Username: params.email,
      MessageAction: "SUPPRESS",
      UserAttributes: [
        { Name: "email", Value: params.email },
        // The provider verified it. Saying otherwise would email a code for an
        // address that has just been proven, and leave the account unusable
        // until someone typed it back.
        { Name: "email_verified", Value: "true" },
        { Name: PROVIDER_IDS_ATTRIBUTE, Value: params.identity },
      ],
    }),
  );

  await client.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: params.userPoolId,
      Username: params.email,
      Password: `${randomBytes(24).toString("base64url")}aA1!`,
      Permanent: true,
    }),
  );
}

export async function setProviderIdentities(params: {
  userPoolId: string;
  username: string;
  identities: string[];
}): Promise<void> {
  await client.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: params.userPoolId,
      Username: params.username,
      UserAttributes: [
        { Name: PROVIDER_IDS_ATTRIBUTE, Value: params.identities.join(" ") },
      ],
    }),
  );
}
