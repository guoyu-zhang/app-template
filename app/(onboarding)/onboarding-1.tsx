import { type Href, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { styles } from "./styles";

export default function OnboardingOneScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Onboarding 1</Text>
        <Text style={styles.subtitle}>
          Discover your personalized experience.
        </Text>
        <View style={styles.onboardingCard}>
          <Text style={styles.onboardingText}>
            We will help you get the app configured for your goals.
          </Text>
        </View>
        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push("/(onboarding)/onboarding-2" as Href)}
        >
          <Text style={styles.primaryButtonText}>Next</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
