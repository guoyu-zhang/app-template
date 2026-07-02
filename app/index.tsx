import { useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAuthRedirect } from "@/lib/session/use-auth-redirect";

export default function Index() {
  const router = useRouter();
  useAuthRedirect(router);

  return (
    <View style={styles.container}>
      <ActivityIndicator color="#0a7ea4" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
});
