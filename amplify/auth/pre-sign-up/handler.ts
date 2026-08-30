import type { PreSignUpTriggerHandler } from "aws-lambda";

import {
  findUsersByEmail,
  isFederated,
  linkFederatedIdentity,
  splitFederatedUsername,
} from "../native-token/cognito-users";

/**
 * Keeps the hosted UI and native sign-in on one account.
 *
 * Web still signs in through Cognito's hosted UI, which federates: it makes its
 * own user, prefixed with the provider name. If that person already has a
 * native account — signed in on their phone, or with an email and password —
 * Cognito would happily give them a second one. Linking the incoming identity
 * to the account that exists is what stops that.
 *
 * Every other kind of sign-up falls through untouched: an ordinary email
 * sign-up still gets its emailed code, and the account created server-side by
 * provision-user arrives here as an admin creation with nothing to do.
 */
export const handler: PreSignUpTriggerHandler = async (event) => {
  if (event.triggerSource !== "PreSignUp_ExternalProvider") return event;

  const email = event.request.userAttributes.email?.toLowerCase();
  if (!email) return event;

  const incoming = splitFederatedUsername(event.userName);
  if (!incoming) return event;

  const existing = (await findUsersByEmail(event.userPoolId, email)).find(
    (user) => user.Username && !isFederated(user),
  );
  if (!existing?.Username) return event;

  await linkFederatedIdentity({
    userPoolId: event.userPoolId,
    nativeUsername: existing.Username,
    providerName: incoming.providerName,
    subject: incoming.subject,
  });

  // The provider vouched for the address, and the account it now points at was
  // already confirmed; asking for a code here would strand the sign-in.
  event.response.autoConfirmUser = true;
  event.response.autoVerifyEmail = true;
  return event;
};
