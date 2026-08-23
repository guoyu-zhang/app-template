import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { type Href, type Router } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { useEffect } from "react";

import { auth, type BackendSession } from "@/lib/backend";

async function updatePushToken() {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    // We update user metadata instead of a profiles table
    // since we cannot guarantee a profiles table exists
    await auth.updateUserMetadata({ push_token: tokenData.data });
  } catch (error) {
    console.error("Failed to update push token on auth change:", error);
  }
}

export function useAuthRedirect(router: Router) {
  const posthog = usePostHog();

  useEffect(() => {
    let isActive = true;

    const redirectBySession = (session: BackendSession | null) => {
      if (session?.user) {
        updatePushToken();
        // Social sign-ins can withhold the email; PostHog properties must
        // not carry undefined.
        posthog.identify(
          session.user.id,
          session.user.email ? { email: session.user.email } : undefined,
        );
      } else {
        posthog.reset();
      }

      router.replace(
        (session ? "/(tabs)/home" : "/(onboarding)/welcome") as Href,
      );
    };

    auth.getSession().then((session) => {
      if (!isActive) return;
      redirectBySession(session);
    });

    const subscription = auth.onAuthStateChange((session) => {
      if (!isActive) return;
      redirectBySession(session);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [router, posthog]);
}
