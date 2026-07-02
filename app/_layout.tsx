import { Stack } from "expo-router";
import { PostHogProvider } from "posthog-react-native";

import { PostHogScreenTracker } from "@/lib/analytics/posthog-screen-tracker";

export default function RootLayout() {
  return (
    <PostHogProvider
      apiKey={process.env.EXPO_PUBLIC_POSTHOG_API_KEY}
      options={{ host: process.env.EXPO_PUBLIC_POSTHOG_HOST }}
      autocapture={{ captureScreens: false }}
    >
      <PostHogScreenTracker />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </PostHogProvider>
  );
}
