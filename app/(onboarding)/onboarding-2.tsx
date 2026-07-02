import { type Href, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { styles } from "./styles";

export default function OnboardingTwoScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Onboarding 2</Text>
        <Text style={styles.subtitle}>
          You are one step away from creating your account.
        </Text>
        <View style={styles.onboardingCard}>
          <Text style={styles.onboardingText}>
            Next, create your account to save your progress and continue.
          </Text>
        </View>
        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push("/(onboarding)/signup" as Href)}
        >
          <Text style={styles.primaryButtonText}>Continue</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
