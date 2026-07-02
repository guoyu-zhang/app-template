import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { supabase } from "@/lib/supabase";

export default function ProfileScreen() {
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  return (
    <View style={styles.container}>
      <Text>This is the profile screen</Text>
      <Pressable onPress={handleSignOut} style={styles.button}>
        <Text style={styles.buttonText}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#0a7ea4",
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "600",
  },
});
