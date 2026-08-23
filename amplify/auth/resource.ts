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
 * 2. `callbackUrls` must contain the app's scheme (`apptemplateaws://`, from
 *    app.json). `signInWithRedirect` hands Cognito this URL and Cognito
 *    refuses anything not registered here. A fork that renames its scheme
 *    must change it in both places.
 *
 * 3. `custom:push_token` exists because Cognito attributes are declared, not
 *    free-form. Supabase's `user_metadata` is a JSON column that accepts any
 *    key; every key the app writes through `auth.updateUserMetadata` needs a
 *    line here first, and adding one later is a user pool update.
 */
/**
 * Apple is in unless explicitly skipped, because "in" is the steady state and
 * a plain `npx ampx sandbox` must reach it.
 *
 * The first deploy of a new backend has to skip it, though, and the reason is
 * circular rather than accidental: this stack will not build without the four
 * Apple secrets, and one of them — the Service ID — cannot be configured at
 * Apple until its Return URL is known, which is the Cognito hosted-UI domain,
 * which does not exist until this stack has been deployed. `defineAuth` does
 * not accept a `domainPrefix`, so the domain cannot be chosen in advance
 * either.
 *
 * So: deploy once with AMPLIFY_SKIP_APPLE=1 and email/Google work, the domain
 * exists, Apple's Service ID can be finished, and the next deploy adds Apple.
 */
const skipApple = process.env.AMPLIFY_SKIP_APPLE === "1";

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
      ...(skipApple
        ? {}
        : {
            signInWithApple: {
              clientId: secret("APPLE_SERVICE_ID"),
              teamId: secret("APPLE_TEAM_ID"),
              keyId: secret("APPLE_KEY_ID"),
              privateKey: secret("APPLE_PRIVATE_KEY"),
              scopes: ["email", "name"] as const,
              attributeMapping: { email: "email" },
            },
          }),
      callbackUrls: ["apptemplateaws://", "http://localhost:8081/"],
      logoutUrls: ["apptemplateaws://", "http://localhost:8081/"],
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
