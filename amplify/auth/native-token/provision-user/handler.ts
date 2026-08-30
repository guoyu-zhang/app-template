import type { LambdaFunctionURLHandler } from "aws-lambda";

import {
  createNativeUser,
  findUsersByEmail,
  isFederated,
  setProviderIdentities,
} from "../cognito-users";
import { identitiesOf, withIdentity } from "../identity";
import { isNativeProvider, verifyProviderToken } from "../verify-token";

/**
 * Creates the Cognito account behind a native sign-in, server-side.
 *
 * Cognito will not start an auth flow for a user that does not exist and will
 * not create one mid-challenge, so somebody has to make the account before the
 * first sign-in can happen. That somebody is deliberately not the device:
 *
 *   - the provider token stays out of `ClientMetadata`, which AWS does not
 *     encrypt and tells you not to put sensitive values in;
 *   - the account's password is generated here and never known to the client,
 *     so a provider-backed account has no second, typeable way in;
 *   - the identity written onto the account is one this function verified,
 *     not one the caller asserted.
 *
 * The URL is unauthenticated because it has to be — nobody has a session yet.
 * What it will do for an anonymous caller is bounded by the token: without one
 * that Apple or Google signed, for this app, minutes ago, it does nothing.
 */

const MAX_BODY_BYTES = 8 * 1024;

const USER_POOL_ID = process.env.USER_POOL_ID;

function reply(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler: LambdaFunctionURLHandler = async (event) => {
  if (event.requestContext.http.method !== "POST") {
    return reply(405, { error: "Use POST." });
  }
  if (!USER_POOL_ID) {
    console.error("USER_POOL_ID is not configured.");
    return reply(500, { error: "Sign-in is misconfigured." });
  }
  if (!event.body || event.body.length > MAX_BODY_BYTES) {
    return reply(400, { error: "Unusable request body." });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(
      event.isBase64Encoded
        ? Buffer.from(event.body, "base64").toString("utf8")
        : event.body,
    );
  } catch {
    return reply(400, { error: "Unusable request body." });
  }

  const { provider, token, nonce } = (parsed ?? {}) as {
    provider?: unknown;
    token?: unknown;
    nonce?: unknown;
  };
  if (!isNativeProvider(provider) || typeof token !== "string" || !token) {
    return reply(400, { error: "Unusable request body." });
  }

  try {
    const identity = await verifyProviderToken(
      provider,
      token,
      typeof nonce === "string" ? nonce : undefined,
    );

    /**
     * Deliberately not claimed in the replay store. Provisioning is
     * idempotent — a repeat produces the same account and no session — and
     * spending the token here would leave the sign-in that follows with
     * nothing to present.
     */
    const existing = (await findUsersByEmail(USER_POOL_ID, identity.email))
      .filter((user) => user.Username && !isFederated(user));

    if (existing.length === 0) {
      await createNativeUser({
        userPoolId: USER_POOL_ID,
        email: identity.email,
        identity: identity.identity,
      });
      return reply(200, { status: "created" });
    }

    /**
     * An account is already using this address — an email/password account, or
     * one made by an earlier provider sign-in. Attaching to it is the intended
     * behaviour (one person, one account) and is safe because both sides of the
     * address are verified: the provider vouched for the token's, and Cognito
     * would not let an account sign in with an unverified one.
     *
     * `withIdentity` is where that stops: a second Apple or Google subject for
     * a provider the account already lists is refused rather than merged.
     */
    const [account] = existing;
    const { identities, changed } = withIdentity(
      identitiesOf(account),
      identity.identity,
    );
    if (changed) {
      await setProviderIdentities({
        userPoolId: USER_POOL_ID,
        username: account.Username!,
        identities,
      });
    }
    return reply(200, { status: changed ? "linked" : "ready" });
  } catch (error) {
    console.error("Provisioning refused:", error);
    return reply(401, {
      error: error instanceof Error ? error.message : "Sign-in was refused.",
    });
  }
};
