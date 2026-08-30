import type { DefineAuthChallengeTriggerHandler } from "aws-lambda";

import { NATIVE_TOKEN_CHALLENGE } from "../config";

/**
 * The state machine for native provider sign-in. Cognito calls this before and
 * after every challenge and asks one question: what next?
 *
 * There is exactly one round. The client already holds the provider token when
 * the flow starts, so nothing is sent to it and nothing needs a retry — and a
 * retry is precisely what an attacker would want, since it turns one guess at
 * a token into many.
 */
export const handler: DefineAuthChallengeTriggerHandler = async (event) => {
  /**
   * No account with this email. The client reads the failure as "sign this
   * person up first", so failing fast is what makes account creation work;
   * carrying on would issue a challenge nobody can answer.
   */
  if (event.request.userNotFound) {
    event.response.failAuthentication = true;
    event.response.issueTokens = false;
    return event;
  }

  const session = event.request.session ?? [];

  if (session.length === 0) {
    event.response.challengeName = "CUSTOM_CHALLENGE";
    event.response.failAuthentication = false;
    event.response.issueTokens = false;
    return event;
  }

  const [attempt] = session;
  const answered =
    session.length === 1 &&
    attempt.challengeName === "CUSTOM_CHALLENGE" &&
    attempt.challengeMetadata === NATIVE_TOKEN_CHALLENGE &&
    attempt.challengeResult;

  event.response.issueTokens = Boolean(answered);
  event.response.failAuthentication = !answered;
  return event;
};
