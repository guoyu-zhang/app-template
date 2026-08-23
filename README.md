# App Template

A boilerplate for apps.

## Branches

The template ships in two backend flavours. Everything above the backend —
navigation, onboarding, paywall, settings, analytics — is identical.

| Branch | Backend | State |
| --- | --- | --- |
| `main` | AWS / Amplify (Cognito, AppSync, S3) | **in progress** — adapters are stubs |
| `supabase` | Supabase | working; every shipped app is on this line |

```bash
git clone https://github.com/guoyu-zhang/app-template.git new-app            # AWS
git clone -b supabase https://github.com/guoyu-zhang/app-template.git new-app # Supabase
```

Both are checked out locally as `~/Projects/app-template` and
`~/Projects/app-template-supabase` (a git worktree of the same repo).

Shared work lands on `main` and merges into `supabase`; backend work never
crosses. The two differ only in `lib/backend/` and the backend's own config.

## Tech Stack
- **Framework**: Expo / React Native
- **Backend & Auth**: AWS Amplify — Cognito, AppSync/DynamoDB, S3 *(see `lib/backend/aws/README.md`)*
- **Payments**: RevenueCat
- **Analytics**: PostHog

## Prerequisites
- Node.js & npm
- [EAS CLI](https://docs.expo.dev/build/setup/) (`npm i -g eas-cli`)
- iOS Simulator, Android Emulator, or a physical device

## Development
1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Setup:**
   Ensure your `.env` file is populated with your RevenueCat and PostHog keys.
   The AWS backend reads `amplify_outputs.json`, written by `npx ampx sandbox`.

3. **Start the App:**
   To run locally on a simulator/emulator:
   ```bash
   npm run ios
   # or
   npm run android
   ```

   To test on a physical device using an EAS development build:
   ```bash
   npx expo start --dev-client --tunnel
   ```

## Key Features
- **Authentication**: Apple and Google sign-in behind a backend adapter
  (`@/lib/backend`), so screens never touch a vendor SDK.
- **Monetization**: Built-in paywall integrated with RevenueCat (`app/(onboarding)/paywall.tsx`).
- **Analytics**: Event tracking with PostHog (`posthog.capture()`).
- **Growth**: Native app review prompts integrated via `expo-store-review`.

## Build & Release
iOS builds are configured with `ios.useFrameworks: "static"` to support Swift pods. Run EAS build when you're ready for TestFlight or production.
