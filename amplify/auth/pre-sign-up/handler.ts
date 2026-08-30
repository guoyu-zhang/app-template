import type { PreSignUpTriggerHandler } from "aws-lambda";

import {
  NATIVE_PROVIDER_METADATA_KEY,
  NATIVE_TOKEN_METADATA_KEY,
} from "../native-token/config";
import {
  findUsersByEmail,
  isFederated,
  linkFederatedIdentity,
  splitFederatedUsername,
} from "../native-token/cognito-users";
import {
  isNativeProvider,
  verifyProviderToken,
} from "../native-token/verify-token";

/**
 * Guards the two ways an account can come into existence besides an ordinary
 * email sign-up.
 *
 * 1. A provider-token sign-up. The client cannot create an account out of an
 *    Apple or Google token on its own — Cognito has no such API — so it signs
 *    the user up by email and sends the token along as client metadata. This
 *    trigger verifies the token and, only then, confirms the account without
 *    an emailed code. The verification is what makes that safe: without it,
 *    anyone could claim any address by asserting they had signed in with
 *    Apple.
 *
 * 2. A hosted-UI sign-in (still the web path) for someone who already has a
 *    native account. Left alone, Cognito would make a second, federated user
 *    for the same person; instead the provider identity is linked to the
 *    account that exists.
 *
 * Ordinary email sign-ups fall through untouched, still confirmed by code.
 */
export const handler: PreSignUpTriggerHandler = async (event) => {
  if (event.triggerSource === "PreSignUp_ExternalProvider") {
    await linkToExistingAccount(event);
    return event;
  }

  if (event.triggerSource !== "PreSignUp_SignUp") return event;

  const metadata = event.request.clientMetadata ?? {};
  const provider = metadata[NATIVE_PROVIDER_METADATA_KEY];
  const token = metadata[NATIVE_TOKEN_METADATA_KEY];

  // No provider claim at all: an ordinary email sign-up, which Cognito should
  // handle exactly as it did before this trigger existed.
  if (!provider && !token) return event;

  if (!isNativeProvider(provider) || !token) {
    throw new Error("Provider sign-up is missing its provider or token.");
  }

  const identity = await verifyProviderToken(provider, token);
  const email = event.request.userAttributes.email?.toLowerCase();
  /**
   * The token proves the provider verified *its* address. This says the
   * account being created is that address and not another one — the check that
   * stops a valid token being used to claim someone else's email.
   */
  if (!email || email !== identity.email) {
    throw new Error("Provider token was issued for a different email address.");
  }

  event.response.autoConfirmUser = true;
  event.response.autoVerifyEmail = true;
  return event;
};

async function linkToExistingAccount(
  event: Parameters<PreSignUpTriggerHandler>[0],
): Promise<void> {
  const email = event.request.userAttributes.email?.toLowerCase();
  if (!email) return;

  const incoming = splitFederatedUsername(event.userName);
  if (!incoming) return;

  const existing = (await findUsersByEmail(event.userPoolId, email)).find(
    (user) => user.Username && !isFederated(user),
  );
  if (!existing?.Username) return;

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
}
