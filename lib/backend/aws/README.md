# AWS backend adapter

Implements the `@/lib/backend` contract against Amplify Gen 2 (Cognito for
auth, AppSync + DynamoDB for data, S3 for storage).

**Status: stubs.** Every method throws `notImplemented()` until the Amplify
backend exists. The Supabase implementation of the same interface is on the
`supabase` branch — use it as the reference for expected behaviour.

## To make these real

1. `npm create amplify@latest` — scaffolds `amplify/`
2. `npm add aws-amplify @aws-amplify/react-native @react-native-community/netinfo react-native-get-random-values react-native-url-polyfill`
3. Define `amplify/auth/resource.ts`, `amplify/data/resource.ts`, `amplify/storage/resource.ts`
4. `npx ampx sandbox` — deploys and writes `amplify_outputs.json`
5. Call `Amplify.configure(outputs)` once, in `app/_layout.tsx`
6. Fill in the methods below

## Known gaps to resolve before this can ship

- **`signInWithIdToken` has no Cognito equivalent.** Supabase accepts a native
  Apple/Google token directly. Cognito requires `signInWithRedirect`, which
  opens a browser webview instead of the native sign-in sheet. Validate that
  UX on a real device before going further — if it is unacceptable, the whole
  migration stops here.
- **Cognito's built-in email sender caps at 50 messages/day account-wide.**
  Password resets need SES, and SES needs production access (a support ticket).
- **`deleteAccount` is two calls, not one.** Cognito's `deleteUser` removes the
  identity; the user's rows in DynamoDB must be deleted separately, by a
  Lambda that owns that logic.
