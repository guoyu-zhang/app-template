import { defineAuth, secret } from "@aws-amplify/backend";

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
  },
});
