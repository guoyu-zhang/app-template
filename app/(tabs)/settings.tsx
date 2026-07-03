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

import { restorePurchasesAccess } from "@/lib/billing/purchases";
import { supabase } from "@/lib/supabase";

const IOS_APP_STORE_ID = process.env.EXPO_PUBLIC_IOS_APP_STORE_ID;

export default function SettingsPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isEmailUser, setIsEmailUser] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        // Check if the user's primary provider is email
        const isEmail = session.user.app_metadata.provider === "email";
        setIsEmailUser(isEmail);
        setUserEmail(session.user.email || "");
      }
    });
  }, []);

  const handleResetPassword = async () => {
    if (!userEmail) return;

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail);
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
              const {
                data: { session },
                error: sessionError,
              } = await supabase.auth.getSession();

              if (sessionError || !session?.user) {
                throw new Error("Could not verify your session.");
              }

              // 2. Call the Supabase RPC function to delete the user
              // Note: You must create this RPC function in your Supabase dashboard first!
              const { error: rpcError } = await supabase.rpc("delete_user");

              if (rpcError) {
                console.error("RPC Error:", rpcError);
                throw new Error("Failed to delete account on the server.");
              }

              // 3. Sign out the user locally
              await supabase.auth.signOut();

              // 4. Redirect to welcome screen
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
          style={styles.button}
          onPress={handleOpenNotificationSettings}
        >
          <Text style={styles.buttonText}>Notification Settings</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={() =>
            WebBrowser.openBrowserAsync("https://xlaris.com/privacy")
          }
        >
          <Text style={styles.buttonText}>Privacy Policy</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={() =>
            WebBrowser.openBrowserAsync("https://xlaris.com/terms")
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
