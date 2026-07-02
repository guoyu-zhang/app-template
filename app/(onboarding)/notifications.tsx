import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "@/lib/supabase";
import { styles } from "./styles";

// Ensure notifications show up when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function NotificationsScreen() {
  const router = useRouter();
  const [isRequesting, setIsRequesting] = useState(false);
  const [message, setMessage] = useState("");

  const goToApp = () => {
    router.replace("/(tabs)/home");
  };

  const requestNotificationPermission = async () => {
    setIsRequesting(true);
    setMessage("");
    try {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#FF231F7C",
        });
      }

      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus === "granted") {
        try {
          // Get the token that uniquely identifies this device
          const projectId =
            Constants?.expoConfig?.extra?.eas?.projectId ??
            Constants?.easConfig?.projectId;

          const tokenData = await Notifications.getExpoPushTokenAsync({
            projectId,
          });

          const token = tokenData.data;
          console.log("Expo Push Token:", token);

          // Save the push token to Supabase for the current user's metadata
          // since we cannot guarantee a profiles table exists
          const { error } = await supabase.auth.updateUser({
            data: { push_token: token },
          });

          if (error) {
            console.error("Error saving push token to Supabase:", error);
          } else {
            console.log("Push token saved to Supabase successfully!");
          }
        } catch (tokenError) {
          console.error("Failed to get push token:", tokenError);
        }

        goToApp();
        return;
      }
      setMessage("Notifications are off for now. You can enable them later.");
    } catch (error) {
      console.error("Error requesting notifications:", error);
      setMessage("Could not request notifications right now.");
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.subtitle}>
          Allow notifications so we can send useful updates.
        </Text>
        <View style={styles.onboardingCard}>
          <Text style={styles.onboardingText}>
            We use notifications for reminders and important account updates.
          </Text>
        </View>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Pressable
          style={styles.primaryButton}
          onPress={requestNotificationPermission}
          disabled={isRequesting}
        >
          {isRequesting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>Allow Notifications</Text>
          )}
        </Pressable>
        <Pressable
          style={[
            styles.secondaryButton,
            isRequesting && styles.disabledButton,
          ]}
          onPress={goToApp}
          disabled={isRequesting}
        >
          <Text style={styles.secondaryButtonText}>Not Now</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
