import type { CreateAuthChallengeTriggerHandler } from "aws-lambda";

import { NATIVE_TOKEN_CHALLENGE } from "../config";

/**
 * Nothing to issue. The usual custom challenge mails a code and remembers it
 * in `privateChallengeParameters`; here the answer — a provider ID token — is
 * already in the client's hands, and its validity comes from Apple's or
 * Google's signature rather than from anything this pool stored.
 *
 * The metadata is the one thing that matters: it names the challenge, so
 * define-auth-challenge can tell this round from any other custom challenge
 * added later, and refuse to issue tokens for one it did not ask for.
 */
export const handler: CreateAuthChallengeTriggerHandler = async (event) => {
  event.response.publicChallengeParameters = {
    challenge: NATIVE_TOKEN_CHALLENGE,
  };
  event.response.privateChallengeParameters = {};
  event.response.challengeMetadata = NATIVE_TOKEN_CHALLENGE;
  return event;
};
