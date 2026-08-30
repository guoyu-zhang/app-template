import { defineAuth, secret } from "@aws-amplify/backend";

import { createAuthChallenge } from "./native-token/create-auth-challenge/resource";
import { defineAuthChallenge } from "./native-token/define-auth-challenge/resource";
import { verifyAuthChallengeResponse } from "./native-token/verify-auth-challenge/resource";
import { preSignUp } from "./pre-sign-up/resource";

/**
 * Cognito user pool — the AWS half of what the Supabase branch gets from
 * GoTrue. Three things here are not obvious:
 *
 * 1. The external provider credentials are Amplify secrets, not literals.
 *    Set them once per sandbox/branch before the first deploy, or the
 *    CloudFormation stack fails on the user pool:
 *
 *      npx ampx sandbox secret set GOOGLE_CLIENT_ID
 *      npx ampx sandbox secret set GOOGLE_CLIENT_SECRET
 *      npx ampx sandbox secret set APPLE_SERVICE_ID
 *      npx ampx sandbox secret set APPLE_TEAM_ID
 *      npx ampx sandbox secret set APPLE_KEY_ID
 *      npx ampx sandbox secret set APPLE_PRIVATE_KEY   # the whole .p8 body
 *
 *    The Google values come from the OAuth *web* client, not the iOS one —
 *    Cognito is the party doing the exchange, not the device.
 *
 * 2. `callbackUrls` must contain the app's scheme (`apptemplate://`, from
 *    app.json). `signInWithRedirect` hands Cognito this URL and Cognito
 *    refuses anything not registered here. A fork that renames its scheme
 *    must change it in both places.
 *
 * 3. `custom:push_token` exists because Cognito attributes are declared, not
 *    free-form. Supabase's `user_metadata` is a JSON column that accepts any
 *    key; every key the app writes through `auth.updateUserMetadata` needs a
 *    line here first, and adding one later is a user pool update.
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
    externalProviders: {
      google: {
        clientId: secret("GOOGLE_CLIENT_ID"),
        clientSecret: secret("GOOGLE_CLIENT_SECRET"),
        scopes: ["email", "profile"],
        attributeMapping: { email: "email" },
      },
      signInWithApple: {
        clientId: secret("APPLE_SERVICE_ID"),
        teamId: secret("APPLE_TEAM_ID"),
        keyId: secret("APPLE_KEY_ID"),
        privateKey: secret("APPLE_PRIVATE_KEY"),
        scopes: ["email", "name"],
        attributeMapping: { email: "email" },
      },
      callbackUrls: ["apptemplate://", "http://localhost:8081/"],
      logoutUrls: ["apptemplate://", "http://localhost:8081/"],
    },
  },
  userAttributes: {
    email: { required: true, mutable: true },
    "custom:push_token": {
      dataType: "String",
      mutable: true,
      minLen: 0,
      maxLen: 2048,
    },
    /**
     * The `provider|subject` pairs a native sign-in may open this account
     * with. Written only by the backend — the app cannot reach it, because
     * being able to add an identity here would be the whole authentication
     * check, self-served.
     */
    "custom:provider_ids": {
      dataType: "String",
      mutable: true,
      minLen: 0,
      maxLen: 512,
    },
  },
  /**
   * Native Apple and Google sign-in lives in these five functions.
   *
   * Cognito has no API that trades a provider ID token for a session, which is
   * why social sign-in used to send everyone to the hosted UI in a browser. A
   * custom auth challenge is the way round it: the device gets the token from
   * the system sheet, and define/create/verify make Cognito accept it as the
   * answer to a challenge. `verifyAuthChallengeResponse` is where the token is
   * actually checked, and is the only thing standing between a stranger's JWT
   * and someone's account.
   *
   * `preSignUp` keeps the two paths on one account: web still federates
   * through the hosted UI, and this links that identity to the native account
   * rather than letting Cognito open a second one. Accounts themselves are
   * created server-side, by the provision-user function.
   */
  triggers: {
    defineAuthChallenge,
    createAuthChallenge,
    verifyAuthChallengeResponse,
    preSignUp,
  },
});
