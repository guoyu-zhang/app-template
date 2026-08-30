import type { PostConfirmationTriggerHandler } from "aws-lambda";

import { NATIVE_PROVIDER_METADATA_KEY } from "../native-token/config";
import {
  copyCustomAttributes,
  customAttributesOf,
  deleteUser,
  federatedIdentityOf,
  findUsersByEmail,
  isFederated,
  linkFederatedIdentity,
} from "../native-token/cognito-users";

/**
 * Carries an existing user across to native sign-in, once.
 *
 * Everyone who signed in with Apple or Google before this flow existed has a
 * *federated* user in the pool, created by the hosted UI. Signing in natively
 * makes a native user instead, and without this the same person would end up
 * with two accounts: the new one empty, the old one unreachable from the app
 * but still the one the web hosted UI resolves to.
 *
 * So on the first native sign-up for an address that already has a federated
 * account: copy the `custom:` attributes over, delete the old user, and point
 * its provider identity at the new one. What is lost is the old Cognito `sub`
 * — which is the RevenueCat app user id, so a subscriber may have to press
 * Restore Purchases once. What is kept is everything the app shows them.
 *
 * Set ADOPT_LEGACY_FEDERATED_USERS to false to copy the attributes and leave
 * the old user in place. Nothing is deleted then, at the cost of the two
 * accounts described above.
 */
const ADOPT_LEGACY_FEDERATED_USERS = true;

export const handler: PostConfirmationTriggerHandler = async (event) => {
  if (event.triggerSource !== "PostConfirmation_ConfirmSignUp") return event;

  /**
   * Only provider-token sign-ups adopt. An email/password account for the same
   * address is a deliberate second way in, and deleting someone's social
   * account because they also set a password would be a surprise.
   *
   * If Cognito ever stops forwarding the sign-up's client metadata here, this
   * reads as "not a provider sign-up" and the migration quietly stops
   * happening — which is the right way for it to fail.
   */
  const provider = event.request.clientMetadata?.[NATIVE_PROVIDER_METADATA_KEY];
  if (!provider) return event;

  const email = event.request.userAttributes.email?.toLowerCase();
  if (!email) return event;

  const legacy = (await findUsersByEmail(event.userPoolId, email)).find(
    (user) => user.Username && user.Username !== event.userName && isFederated(user),
  );
  if (!legacy?.Username) return event;

  await copyCustomAttributes({
    userPoolId: event.userPoolId,
    username: event.userName,
    attributes: customAttributesOf(legacy),
  });

  if (!ADOPT_LEGACY_FEDERATED_USERS) return event;

  /**
   * Read the identity before the delete, and link after it: Cognito refuses to
   * link a provider identity that still belongs to another user.
   */
  const identity = federatedIdentityOf(legacy);
  await deleteUser(event.userPoolId, legacy.Username);
  if (identity) {
    await linkFederatedIdentity({
      userPoolId: event.userPoolId,
      nativeUsername: event.userName,
      providerName: identity.providerName,
      subject: identity.subject,
    });
  }

  return event;
};
