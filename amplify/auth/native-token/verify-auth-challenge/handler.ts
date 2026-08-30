import type { VerifyAuthChallengeResponseTriggerHandler } from "aws-lambda";

import { isNativeProvider, verifyProviderToken } from "../verify-token";

/**
 * Decides whether the provider token the client sent actually opens this
 * account. Two separate questions, and both have to be answered here:
 *
 *   1. Is the token real? — signature, issuer, audience, freshness.
 *   2. Is it *this user's* token? — the email it was issued for has to be the
 *      email on the account being signed into. Without that second check any
 *      valid Apple token would sign its holder into any account in the pool,
 *      which is the failure mode this whole flow exists to avoid.
 *
 * Failure is silent by design: `answerCorrect` stays false and the reason goes
 * to the log, because telling the caller *why* a token was rejected tells an
 * attacker which of the checks to work on.
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

  const { provider, token } = (parsed ?? {}) as {
    provider?: unknown;
    token?: unknown;
  };
  if (!isNativeProvider(provider) || typeof token !== "string" || !token) {
    console.error("Challenge answer named no usable provider token.");
    return event;
  }

  try {
    const identity = await verifyProviderToken(provider, token);
    const accountEmail = event.request.userAttributes?.email?.toLowerCase();
    if (!accountEmail || accountEmail !== identity.email) {
      console.error(
        `Token for ${identity.provider} belongs to another account.`,
      );
      return event;
    }
    event.response.answerCorrect = true;
  } catch (error) {
    console.error("Provider token rejected:", error);
  }

  return event;
};
