import { type Href, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { styles } from "./styles";

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Welcome</Text>
        <Text style={styles.subtitle}>Choose how you want to start</Text>
        <Pressable
          style={styles.boxButton}
          onPress={() => router.push("/(onboarding)/onboarding-1" as Href)}
        >
          <Text style={styles.boxTitle}>Get Started</Text>
          <Text style={styles.boxSubtitle}>
            New here? Let&apos;s set things up.
          </Text>
        </Pressable>
        <Pressable
          style={styles.boxButton}
          onPress={() => router.push("/(onboarding)/signin" as Href)}
        >
          <Text style={styles.boxTitle}>I Already Have an Account</Text>
          <Text style={styles.boxSubtitle}>
            Sign in with email, Google, or Apple.
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
