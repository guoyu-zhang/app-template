# App Template

A boilerplate for apps.

## Tech Stack
- **Framework**: Expo / React Native 
- **Backend & Auth**: Supabase 
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
   Ensure your `.env` file is populated with your Supabase, RevenueCat, and PostHog keys.

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
- **Authentication**: Pre-configured Apple and Google Auth via Supabase.
- **Monetization**: Built-in paywall integrated with RevenueCat (`app/(onboarding)/paywall.tsx`).
- **Analytics**: Event tracking with PostHog (`posthog.capture()`).
- **Growth**: Native app review prompts integrated via `expo-store-review`.

## Build & Release
iOS builds are configured with `ios.useFrameworks: "static"` to support Swift pods. Run EAS build when you're ready for TestFlight or production.
