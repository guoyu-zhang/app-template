import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineBackend } from "@aws-amplify/backend";
import { RemovalPolicy, Stack } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  Table,
  TableEncryption,
} from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { FunctionUrlAuthType, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

import { auth } from "./auth/resource";
import { createAuthChallenge } from "./auth/native-token/create-auth-challenge/resource";
import { defineAuthChallenge } from "./auth/native-token/define-auth-challenge/resource";
import { verifyAuthChallengeResponse } from "./auth/native-token/verify-auth-challenge/resource";
import { preSignUp } from "./auth/pre-sign-up/resource";
import { data } from "./data/resource";
import { storage } from "./storage/resource";

const backend = defineBackend({
  auth,
  data,
  storage,
  preSignUp,
  defineAuthChallenge,
  createAuthChallenge,
  verifyAuthChallengeResponse,
});

/**
 * The pre-sign-up trigger looks an account up by email and links a hosted-UI
 * identity to it. Amplify grants a trigger nothing by default, and these are
 * the only two calls it makes.
 *
 * The resource is every pool in this account and region rather than the one
 * pool, and that is forced rather than chosen: naming the pool would make this
 * function's stack depend on the auth stack, which already depends on the
 * function because it is one of its triggers, and CloudFormation rejects the
 * cycle. The provisioning function below is not a trigger, so it can and does
 * name the pool exactly.
 */
backend.preSignUp.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: [
      "cognito-idp:ListUsers",
      "cognito-idp:AdminLinkProviderForUser",
    ],
    resources: [
      `arn:aws:cognito-idp:${backend.stack.region}:${backend.stack.account}:userpool/*`,
    ],
  }),
);

/**
 * One provider token, one sign-in.
 *
 * A token lifted off a device stays valid until it expires — an hour, for
 * Google — and nothing in the token itself says whether it has been spent. So
 * the challenge verifier records each one and refuses a repeat. The table
 * lives in the verifier's own stack so the grant and the table name stay
 * inside one stack; TTL clears the rows, and nothing here is worth keeping
 * past the token's own lifetime.
 */
const verifier = backend.verifyAuthChallengeResponse.resources.lambda;
const usedTokens = new Table(Stack.of(verifier), "UsedProviderTokens", {
  partitionKey: { name: "tokenHash", type: AttributeType.STRING },
  timeToLiveAttribute: "expiresAt",
  billingMode: BillingMode.PAY_PER_REQUEST,
  encryption: TableEncryption.AWS_MANAGED,
  removalPolicy: RemovalPolicy.DESTROY,
});
usedTokens.grantWriteData(verifier);
backend.verifyAuthChallengeResponse.addEnvironment(
  "USED_TOKENS_TABLE",
  usedTokens.tableName,
);

/**
 * Account creation for native sign-in, server-side and off the device.
 *
 * Cognito will not create a user in the middle of an auth challenge, so the
 * first sign-in for a new person has to make the account first. Doing that
 * from the app would mean either putting the provider token in Cognito's
 * `ClientMetadata` — which AWS does not encrypt, and says not to use for
 * sensitive values — or letting the client choose the account's password.
 * Neither is necessary: this function verifies the token itself and creates
 * the account with a password nobody keeps.
 *
 * A plain CDK function rather than `defineFunction`, in its own stack, because
 * it needs the user pool's id and arn. A trigger cannot have those without a
 * dependency cycle; this, not being a trigger, can — which is also what lets
 * its permissions name the one pool instead of a wildcard.
 */
const provisioning = backend.createStack("native-provisioning");
const provisionUser = new NodejsFunction(provisioning, "ProvisionNativeUser", {
  entry: join(
    dirname(fileURLToPath(import.meta.url)),
    "auth/native-token/provision-user/handler.ts",
  ),
  runtime: Runtime.NODEJS_20_X,
  environment: {
    USER_POOL_ID: backend.auth.resources.userPool.userPoolId,
  },
});

provisionUser.addToRolePolicy(
  new PolicyStatement({
    actions: [
      "cognito-idp:ListUsers",
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminSetUserPassword",
      "cognito-idp:AdminUpdateUserAttributes",
    ],
    resources: [backend.auth.resources.userPool.userPoolArn],
  }),
);

/**
 * Unauthenticated because it has to be — the caller has no session yet, that
 * being the point. What it will do for a stranger is bounded by the token it
 * demands: one Apple or Google signed, for this app, minutes ago.
 */
const provisionUrl = provisionUser.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});

backend.addOutput({
  custom: {
    provision_native_user_url: provisionUrl.url,
  },
});
