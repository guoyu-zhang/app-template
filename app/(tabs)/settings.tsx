import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import * as StoreReview from "expo-store-review";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PRIVACY_URL, TERMS_URL } from "@/lib/legal";
import { restorePurchasesAccess } from "@/lib/billing/purchases";
import { auth } from "@/lib/backend";

const IOS_APP_STORE_ID = process.env.EXPO_PUBLIC_IOS_APP_STORE_ID;

export default function SettingsPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isTestingPush, setIsTestingPush] = useState(false);
  const [isEmailUser, setIsEmailUser] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    auth.getSession().then((session) => {
      if (session?.user) {
        // Check if the user's primary provider is email
        setIsEmailUser(session.user.provider === "email");
        setUserEmail(session.user.email || "");
      }
    });
  }, []);

  const handleResetPassword = async () => {
    if (!userEmail) return;

    try {
      const { error } = await auth.resetPassword(userEmail);
      if (error) throw error;
      Alert.alert(
        "Password Reset",
        "A password reset link has been sent to your email address.",
      );
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to send reset email.");
    }
  };

  const handleRestorePurchases = async () => {
    setIsRestoring(true);
    setMessage("");

    try {
      const hasAccess = await restorePurchasesAccess();
      if (hasAccess) {
        Alert.alert(
          "Success",
          "Your purchases have been successfully restored.",
        );
      } else {
        Alert.alert(
          "Restore Failed",
          "No previous purchase was found for your account.",
        );
      }
    } catch {
      Alert.alert("Error", "Could not restore purchases at this time.");
    } finally {
      setIsRestoring(false);
    }
  };

  const handleLeaveReview = () => {
    if (!IOS_APP_STORE_ID) {
      Alert.alert(
        "Not Available Yet",
        "This app doesn't have an App Store listing configured yet.",
      );
      return;
    }

    Linking.openURL(
      `https://apps.apple.com/app/id${IOS_APP_STORE_ID}?action=write-review`,
    );
  };

  const handleRequestReviewPopup = async () => {
    const isAvailable = await StoreReview.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert(
        "Not Available",
        "The in-app review prompt isn't available on this build.",
      );
      return;
    }

    await StoreReview.requestReview();
  };

  const handleOpenNotificationSettings = () => {
    Linking.openSettings();
  };

  const sendMockNotification = async () => {
    const { status } = await Notifications.getPermissionsAsync();

    if (status !== "granted") {
      setMessage("You need to enable notifications first!");
      return;
    }

    setMessage("");
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Test Notification 🔔",
        body: "This is a mock notification to test if everything is working!",
      },
      trigger: null, // Send immediately
    });
  };

  // The mock notification above never leaves the phone. This one goes
  // token -> Expo -> APNs (or FCM) -> back, which is the only path that can
  // tell you the push credentials are right. Both halves fail quietly: a bad
  // APNs key still returns a ticket, and only the receipt says so.
  const sendPushRoundTrip = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      setMessage("You need to enable notifications first!");
      return;
    }

    setMessage("");
    setIsTestingPush(true);
    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId;

      // Throws when the device never registered with APNs, which is itself
      // the answer — no token, no push, whatever the servers say later.
      const { data: token } = await Notifications.getExpoPushTokenAsync({
        projectId,
      });

      const sendResponse = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: token,
          title: "Round trip 🛫",
          body: "This one came from Apple, not from this device.",
          sound: "default",
        }),
      });
      const ticket = (await sendResponse.json())?.data;

      if (!ticket || ticket.status === "error") {
        Alert.alert(
          "Expo rejected it",
          describePushError(ticket) ||
            "No ticket came back. Check the device is online.",
        );
        return;
      }

      // A ticket only means Expo queued it. The receipt is where a missing
      // APNs key or a stale token actually surfaces, and it takes a few
      // seconds to appear.
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const receiptResponse = await fetch(
          "https://exp.host/--/api/v2/push/getReceipts",
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ids: [ticket.id] }),
          },
        );
        const receipt = (await receiptResponse.json())?.data?.[ticket.id];
        if (!receipt) continue;

        if (receipt.status === "ok") {
          Alert.alert(
            "Delivered ✅",
            "Apple accepted the push, so the APNs key on EAS is right. If no " +
              "banner appeared, that is the phone's notification settings, " +
              "not the credentials.",
          );
        } else {
          Alert.alert("Apple refused it", describePushError(receipt));
        }
        return;
      }

      Alert.alert(
        "No receipt yet",
        `Expo queued it as ${ticket.id} but said nothing within 12s. That is ` +
          "usually a slow queue rather than a failure — try again in a minute.",
      );
    } catch (error: any) {
      Alert.alert(
        "Could not get a push token",
        `${error?.message ?? error}\n\nA simulator cannot register for push, ` +
          "and Expo Go registers against Expo's own project rather than this one.",
      );
    } finally {
      setIsTestingPush(false);
    }
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            setMessage("");

            try {
              // 1. Get the current session
              const session = await auth.getSession();

              if (!session?.user) {
                throw new Error("Could not verify your session.");
              }

              // 2. Delete the account server-side, then clear the local
              // session. The adapter owns both halves.
              const { error } = await auth.deleteAccount();

              if (error) {
                console.error("Delete account error:", error);
                throw new Error("Failed to delete account on the server.");
              }

              // 3. Redirect to welcome screen
              router.replace("/(onboarding)/welcome");
            } catch (error: any) {
              setMessage(
                error.message ||
                  "An error occurred while deleting your account.",
              );
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Settings</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Pressable style={styles.button} onPress={sendMockNotification}>
          <Text style={styles.buttonText}>Test Notification</Text>
        </Pressable>

        <Pressable
          style={[styles.button, isTestingPush && styles.disabledButton]}
          onPress={() => void sendPushRoundTrip()}
          disabled={isTestingPush}
        >
          <Text style={styles.buttonText}>
            {isTestingPush ? "Testing…" : "Test Push Round Trip"}
          </Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={handleOpenNotificationSettings}
        >
          <Text style={styles.buttonText}>Notification Settings</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={() =>
            WebBrowser.openBrowserAsync(PRIVACY_URL)
          }
        >
          <Text style={styles.buttonText}>Privacy Policy</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={() =>
            WebBrowser.openBrowserAsync(TERMS_URL)
          }
        >
          <Text style={styles.buttonText}>Terms of Service</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={() => router.push("/contact")}
        >
          <Text style={styles.buttonText}>Contact Us</Text>
        </Pressable>

        {Platform.OS === "ios" && (
          <>
            <Pressable style={styles.button} onPress={handleLeaveReview}>
              <Text style={styles.buttonText}>Leave a Review</Text>
            </Pressable>

            <Pressable
              style={styles.button}
              onPress={handleRequestReviewPopup}
            >
              <Text style={styles.buttonText}>Rate In-App</Text>
            </Pressable>
          </>
        )}

        <Pressable
          style={[styles.button, isRestoring && styles.disabledButton]}
          onPress={handleRestorePurchases}
          disabled={isRestoring}
        >
          <Text style={styles.buttonText}>
            {isRestoring ? "Restoring..." : "Restore Purchases"}
          </Text>
        </Pressable>

        {isEmailUser && (
          <Pressable style={styles.button} onPress={handleResetPassword}>
            <Text style={styles.buttonText}>Reset Password</Text>
          </Pressable>
        )}

        <Pressable
          style={[
            styles.button,
            styles.deleteButton,
            isDeleting && styles.disabledButton,
          ]}
          onPress={handleDeleteAccount}
          disabled={isDeleting}
        >
          <Text style={styles.buttonText}>
            {isDeleting ? "Deleting..." : "Delete Account"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// Expo puts the useful part in `details.error` — DeviceNotRegistered means a
// stale token, InvalidCredentials means the APNs key on EAS is wrong or
// missing. `message` alone reads like a generic failure.
function describePushError(entry: any): string {
  if (!entry) return "";
  const code = entry?.details?.error;
  const hint =
    code === "DeviceNotRegistered"
      ? "This token is stale — reinstall the build and try again."
      : code === "InvalidCredentials"
        ? "The APNs key on EAS is missing or belongs to another team. Run `eas credentials -p ios`."
        : "";
  return [entry.message, code && `(${code})`, hint].filter(Boolean).join("\n\n");
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 32,
  },
  message: {
    color: "#ff3b30",
    marginBottom: 16,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    width: "100%",
    alignItems: "center",
    marginBottom: 16,
  },
  deleteButton: {
    backgroundColor: "#ff3b30",
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
