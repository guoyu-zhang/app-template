import { Stack } from "expo-router";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
