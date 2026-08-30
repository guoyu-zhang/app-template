# Google Sign-In Setup Guide

A step-by-step guide for setting up Firebase, the Google Auth Platform, and OAuth client credentials for Web, Android, and iOS.

---

## Overview

This guide walks through the full process of configuring Google sign-in for the app, covering three main stages:

1. Create a Firebase project
2. Set up a profile on the Google Auth Platform
3. Create OAuth client IDs for Web, Android, and iOS

---

## 1. Firebase

### Create a Project

Set up a new Firebase project, which will serve as the backend foundation for authentication and any other Firebase services the app uses.

- Go to the Firebase Console (console.firebase.google.com).
- Click "Add project" and follow the setup wizard.
- Once created, this project will be linked to the Google Auth Platform configuration in the next step.

---

## 2. Google Auth Platform (Google Cloud Console)

### Create a Profile

The Google Auth Platform manages the OAuth consent screen and branding details shown to users when they sign in with Google.

- Go to the Google Auth Platform in Google Cloud Console.
- Create a new profile, making sure it is associated with the same Google Cloud project backing the Firebase project from Step 1.
- Fill in the required app information (app name, support email, logo, etc.) for the consent screen.

---

## 3. Create OAuth Client (Google Cloud Console)

Within the same project, create separate OAuth client IDs for each platform the app supports: Web, Android, and iOS.

### Web

- In Google Cloud Console, go to "Credentials" and click "Create Credentials" → "OAuth client ID."
- Select "Web application" as the application type.
- Add the appropriate authorized JavaScript origins and redirect URIs for the app.

### Android

- Select "Android" as the application type when creating the OAuth client.
- Add the package name to the app configuration. In `app.json`, under the `android` section, add:

```json
"package": "com.xlaris.apptemplateid"
```

- Retrieve the SHA-1 certificate fingerprint, which Google requires to verify the app. Run the following command to get it from EAS:

```bash
eas credentials -p android
```

- Copy the SHA-1 value from the command output and paste it into the SHA certificate fingerprint field when creating the Android OAuth client.

- You don't add the Android client ID into app.json, your code, or anywhere manually — it just needs to exist correctly in Google's system (package name + SHA-1 matching), and google-services.json is the file that carries that info into your app at build time.

- Make sure to add the SHA-1 to firebase too (your project -> your apps)

### iOS

- Select "iOS" as the application type when creating the OAuth client.
- Add the app's iOS bundle identifier (this should match the bundle identifier configured in `app.json` under the `ios` section).
- Also add in signin and signup tsx, search for ios client id.
- Save the generated iOS client ID for use in the app's configuration.

---

> **Note:** Make sure the Firebase project, Google Auth Platform profile, and all OAuth clients are created under the same Google Cloud project so they stay linked correctly.

---

## 4. Cognito sign-in providers

Google and Apple are configured as external providers in
`amplify/auth/resource.ts`, not in a dashboard — the web client ID and secret,
and Apple's clientId/keyId/teamId/privateKey, go in as Amplify secrets
(`npx ampx sandbox secret set ...`).

Cognito cannot accept Apple's `identityToken` or Google's `idToken` directly —
there is no API for it — so the pool defines a custom auth challenge whose
answer is that token, verified against the provider's public keys in
`amplify/auth/native-token/verify-auth-challenge`. On iOS and Android that puts
sign-in back on the native system sheet; web still goes through
`signInWithRedirect` and the hosted UI.

Nothing about this is configured in a console. Two values have to be right in
`amplify/auth/native-token/config.ts`:

- `APPLE_AUDIENCES` — the iOS bundle ID from `app.json`. Native Apple tokens are
  addressed to the bundle ID, not to the `APPLE_SERVICE_ID` the hosted UI uses.
- `GOOGLE_AUDIENCES` — the iOS client ID and the web client ID, both from
  `GoogleSignin.configure` in `app/(onboarding)/auth-form.tsx`. Android tokens
  are addressed to the web client ID.

Accounts are created server-side. Cognito will not make a user in the middle of
a challenge, so the first sign-in for a new person calls the unauthenticated
function URL published as `custom.provision_native_user_url` in
`amplify_outputs.json`. That function verifies the same token, creates the
account with a password it generates and discards, and records the identity —
so the app never handles the password, and the token never goes into Cognito's
`ClientMetadata`, which AWS does not encrypt.

An account is opened by `provider|subject`, not by email — the pairs it answers
to live in `custom:provider_ids`. Email finds the account the first time and is
never the credential afterwards. Each token is also spent once: the verifier
records its hash in a DynamoDB table with a TTL, so a captured token cannot be
replayed inside its lifetime.

`npm run test:auth` covers the verifier: audience, issuer, expiry, freshness,
edited payloads, chosen algorithms, unpublished keys, and the identity rules.

*(The Supabase provider setup this section used to describe is on the
`supabase` branch.)*
