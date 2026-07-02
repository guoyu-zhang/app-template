import { useGlobalSearchParams, usePathname } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { useEffect } from "react";

// PostHogProvider's built-in navigation autocapture needs a navigator-owned
// navigation ref, which expo-router's root layout doesn't expose. Track
// screens manually instead, per PostHog's expo-router integration guidance.
export function PostHogScreenTracker() {
  const posthog = usePostHog();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    posthog.screen(pathname, params);
    // paramsKey (not params) intentionally drives this effect: expo-router
    // returns a new params object on every render, which would otherwise
    // re-fire this on renders that don't represent a navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, paramsKey, posthog]);

  return null;
}
