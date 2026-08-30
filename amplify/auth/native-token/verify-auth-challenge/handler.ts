import type { VerifyAuthChallengeResponseTriggerHandler } from "aws-lambda";

import { PROVIDER_IDS_ATTRIBUTE } from "../config";
import { parseIdentities } from "../identity";
import { claimToken } from "../used-tokens";
import { isNativeProvider, verifyProviderToken } from "../verify-token";

/**
 * Decides whether the provider token the client sent opens this account.
 *
 * Three questions, and all three have to be answered here:
 *
 *   1. Is the token real? — signature, issuer, audience, freshness, and the
 *      nonce when the platform stamped one in.
 *   2. Is it *this account's* token? — the account lists `provider|subject`
 *      pairs it answers to, and the token's has to be one of them. Matching on
 *      the email instead would hand the account to whoever holds the address
 *      next, which on a managed domain is a real person.
 *   3. Has it been spent already? — claimed once, in a store with a TTL, so a
 *      token captured off the wire cannot be presented a second time inside
 *      its lifetime.
 *
 * Failure is silent by design: `answerCorrect` stays false and the reason goes
 * to the log, because telling the caller *which* check failed tells an
 * attacker which one to work on.
 */
export const handler: VerifyAuthChallengeResponseTriggerHandler = async (
  event,
) => {
  event.response.answerCorrect = false;

  const answer = event.request.challengeAnswer;
  if (typeof answer !== "string" || !answer) return event;

  let parsed: unknown;
  try {
    parsed = JSON.parse(answer);
  } catch {
    console.error("Challenge answer was not JSON.");
    return event;
  }

  const { provider, token, nonce } = (parsed ?? {}) as {
    provider?: unknown;
    token?: unknown;
    nonce?: unknown;
  };
  if (!isNativeProvider(provider) || typeof token !== "string" || !token) {
    console.error("Challenge answer named no usable provider token.");
    return event;
  }

  try {
    const identity = await verifyProviderToken(
      provider,
      token,
      typeof nonce === "string" ? nonce : undefined,
    );

    const allowed = parseIdentities(
      event.request.userAttributes?.[PROVIDER_IDS_ATTRIBUTE],
    );
    if (!allowed.includes(identity.identity)) {
      console.error(
        `${identity.provider} subject is not linked to this account.`,
      );
      return event;
    }

    // Last, so a token is only spent on a sign-in that was otherwise going to
    // succeed. Claiming first would let anyone burn a victim's token by
    // presenting it against the wrong account.
    await claimToken({
      tokenHash: identity.tokenHash,
      expiresAt: identity.expiresAt,
    });

    event.response.answerCorrect = true;
  } catch (error) {
    console.error("Provider token rejected:", error);
  }

  return event;
};
