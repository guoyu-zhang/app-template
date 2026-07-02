import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { type Href, type Router } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { useEffect } from "react";

import { supabase } from "@/lib/supabase";

async function updatePushToken(userId: string) {
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
    await supabase.auth.updateUser({
      data: { push_token: tokenData.data },
    });
  } catch (error) {
    console.error("Failed to update push token on auth change:", error);
  }
}

export function useAuthRedirect(router: Router) {
  const posthog = usePostHog();

  useEffect(() => {
    let isActive = true;

    const redirectBySession = (session: any) => {
      if (session?.user) {
        updatePushToken(session.user.id);
        posthog.identify(session.user.id, { email: session.user.email });
      } else {
        posthog.reset();
      }

      router.replace(
        (session ? "/(tabs)/home" : "/(onboarding)/welcome") as Href,
      );
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!isActive) return;
      redirectBySession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isActive) return;
      redirectBySession(session);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [router, posthog]);
}
