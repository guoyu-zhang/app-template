import { defineBackend } from "@aws-amplify/backend";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";

import { auth } from "./auth/resource";
import { postConfirmation } from "./auth/post-confirmation/resource";
import { preSignUp } from "./auth/pre-sign-up/resource";
import { data } from "./data/resource";
import { storage } from "./storage/resource";

const backend = defineBackend({
  auth,
  data,
  storage,
  preSignUp,
  postConfirmation,
});

/**
 * Two of the auth triggers do admin work on the pool: they look an account up
 * by email, link a provider identity to it, and (once, for a user moving off
 * the hosted UI) copy attributes across and delete the account left behind.
 * Amplify grants a trigger nothing by default.
 *
 * The resource is every pool in this account and region rather than the one
 * pool, and that is deliberate. Naming the pool would make this function's
 * stack depend on the auth stack — which already depends on the function,
 * because it is one of its triggers — and CloudFormation rejects the cycle.
 */
const userPoolsInThisAccount = `arn:aws:cognito-idp:${backend.stack.region}:${backend.stack.account}:userpool/*`;

for (const trigger of [backend.preSignUp, backend.postConfirmation]) {
  trigger.resources.lambda.addToRolePolicy(
    new PolicyStatement({
      actions: [
        "cognito-idp:ListUsers",
        "cognito-idp:AdminLinkProviderForUser",
        "cognito-idp:AdminUpdateUserAttributes",
        "cognito-idp:AdminDeleteUser",
      ],
      resources: [userPoolsInThisAccount],
    }),
  );
}
