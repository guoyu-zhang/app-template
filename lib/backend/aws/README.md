# AWS backend adapter

Implements the `@/lib/backend` contract against Amplify Gen 2 (Cognito for
auth, AppSync + DynamoDB for data, S3 for storage).

**Status: implemented, never run against AWS.** Every method is written and
typechecks; none has executed against a real user pool. The first real
execution is your `npx ampx sandbox`. The Supabase implementation of the same
interface is on the `supabase` branch and is the one with shipping mileage.

## Bringing it up

1. `npx ampx sandbox secret set` each of `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `APPLE_SERVICE_ID`, `APPLE_TEAM_ID`,
   `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`. The user pool will not deploy without
   them. Google's values come from the OAuth **web** client — Cognito does the
   exchange, not the device.
2. `npx ampx sandbox` — deploys and overwrites `amplify_outputs.json`.
3. `npm start`. Until step 2 has run, the app throws at launch naming the
   command, because the checked-in `amplify_outputs.json` is a placeholder.

## Where AWS does not match the other branch

- **`signInWithIdToken` cannot work.** Cognito will not exchange a native
  Apple/Google token for a user pool session. `supportsNativeIdToken: false`
  tells the screens so, and they take `signInWithRedirect` instead — a browser
  webview rather than the native sign-in sheet. **This is the gate most likely
  to end the migration, and it is invisible on a simulator. Test it on a real
  device before porting anything else.**
- **Password resets need SES.** Cognito's built-in sender caps at 50
  messages/day account-wide. Leaving the SES sandbox is a support ticket,
  roughly 24 hours.
- **Metadata keys must be declared.** `auth.updateUserMetadata` writes into
  the `custom:` namespace, and every key needs a matching entry in
  `amplify/auth/resource.ts` first. Adding one later is a user pool update.
- **Deletion order matters.** `deleteAccount` purges the user's DynamoDB rows
  before removing the Cognito identity, because owner authorization makes them
  unreachable afterwards. A fork that adds owned models must extend
  `purgeOwnedRows` in `db.ts` — nothing enforces it, and the orphans are
  invisible.
- **`storage.getUrl` expires.** It is presigned, one hour, not Supabase's
  permanent public URL. Resolve at render time; do not persist the result.
- **`bucket` is not a boundary.** S3 has no container inside a bucket, so the
  contract's `bucket` becomes a key segment. Access is divided by identity in
  `amplify/storage/resource.ts`, not by bucket name.
- **Callback URLs are registered, not inferred.** `apptemplate://` is listed
  in `amplify/auth/resource.ts`; a fork that renames its scheme in `app.json`
  must change it in both places or the redirect is rejected.
