import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import { type Href, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "@/lib/supabase";

import { styles } from "./styles";

GoogleSignin.configure({
  webClientId:
    "187798873933-ujuitpbpg7e46dskojpead8cvk7b7rs1.apps.googleusercontent.com", // Replace with your web client ID from Supabase Google Provider
  iosClientId:
    "187798873933-o6elcb0ebdfpc27lurlvgjuniic0bdb6.apps.googleusercontent.com", // Replace with your iOS client ID
});

type AuthMode = "signin" | "signup";

const COPY: Record<
  AuthMode,
  {
    title: string;
    subtitle: string;
    emailButtonLabel: string;
    oauthLabel: string;
    oauthGerund: string;
    redirectPath: Href;
  }
> = {
  signin: {
    title: "Sign In",
    subtitle: "Use email or continue with a provider",
    emailButtonLabel: "Sign In with Email",
    oauthLabel: "Sign in",
    oauthGerund: "signing in",
    redirectPath: "/(tabs)/home" as Href,
  },
  signup: {
    title: "Create Account",
    subtitle: "Create your account with email",
    emailButtonLabel: "Create Account",
    oauthLabel: "Sign up",
    oauthGerund: "signing up",
    redirectPath: "/(onboarding)/paywall" as Href,
  },
};

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const copy = COPY[mode];

  async function handleEmailAuth() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setMessage("Please enter both email and password.");
      return;
    }

    setIsLoading(true);
    setMessage("");

    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password,
          })
        : await supabase.auth.signUp({ email: trimmedEmail, password });

    if (error) {
      setMessage(error.message);
    } else {
      router.replace(copy.redirectPath);
    }

    setIsLoading(false);
  }

  async function handleAppleAuth() {
    setIsLoading(true);
    setMessage("");
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      // Sign in via Supabase Auth
      if (credential.identityToken) {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: "apple",
          token: credential.identityToken,
        });

        if (error) {
          setMessage(error.message);
          setIsLoading(false);
          return;
        }

        router.replace(copy.redirectPath);
      } else {
        throw new Error("No identityToken returned from Apple.");
      }
    } catch (e: any) {
      if (e.code === "ERR_REQUEST_CANCELED") {
        // handle that the user canceled the sign-in flow
        setMessage(`${copy.oauthLabel} was canceled.`);
      } else {
        setMessage(
          e.message || `An error occurred ${copy.oauthGerund} with Apple.`,
        );
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleAuth() {
    setIsLoading(true);
    setMessage("");
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      if (userInfo.data?.idToken) {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: userInfo.data.idToken,
        });

        if (error) {
          setMessage(error.message);
          setIsLoading(false);
          return;
        }

        router.replace(copy.redirectPath);
      } else {
        throw new Error("No ID token present!");
      }
    } catch (error: any) {
      if (isErrorWithCode(error)) {
        switch (error.code) {
          case statusCodes.SIGN_IN_CANCELLED:
            setMessage(`${copy.oauthLabel} was canceled.`);
            break;
          case statusCodes.IN_PROGRESS:
            setMessage(`${copy.oauthLabel} is in progress.`);
            break;
          case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
            setMessage("Play services not available or outdated.");
            break;
          default:
            setMessage(
              error.message ||
                `An error occurred ${copy.oauthGerund} with Google.`,
            );
        }
      } else {
        setMessage(
          error.message || `An error occurred ${copy.oauthGerund} with Google.`,
        );
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    if (provider === "apple" && Platform.OS === "ios") {
      return handleAppleAuth();
    }

    if (provider === "google" && Platform.OS !== "web") {
      return handleGoogleAuth();
    }

    setIsLoading(true);
    setMessage("");

    const redirectTo = Linking.createURL("/");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      setMessage(error.message);
      setIsLoading(false);
      return;
    }

    if (!data?.url) {
      setMessage("Unable to start OAuth flow.");
      setIsLoading(false);
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type !== "success") {
      setIsLoading(false);
      return;
    }

    const hash = result.url.includes("#") ? result.url.split("#")[1] : "";
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const errorDescription = params.get("error_description");

    if (errorDescription) {
      setMessage(errorDescription);
      setIsLoading(false);
      return;
    }

    if (!accessToken || !refreshToken) {
      setMessage("OAuth sign-in failed to return tokens.");
      setIsLoading(false);
      return;
    }

    const { error: setSessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (setSessionError) {
      setMessage(setSessionError.message);
      setIsLoading(false);
      return;
    }

    router.replace(copy.redirectPath);
    setIsLoading(false);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.subtitle}>{copy.subtitle}</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
          style={styles.input}
        />
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Pressable
          style={styles.primaryButton}
          onPress={handleEmailAuth}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {copy.emailButtonLabel}
            </Text>
          )}
        </Pressable>
        <View style={styles.oauthContainer}>
          <Pressable
            style={[styles.secondaryButton, isLoading && styles.disabledButton]}
            onPress={() => handleOAuth("google")}
            disabled={isLoading}
          >
            <Text style={styles.secondaryButtonText}>
              {copy.oauthLabel} with Google
            </Text>
          </Pressable>
          {Platform.OS === "ios" && (
            <Pressable
              style={[
                styles.secondaryButton,
                isLoading && styles.disabledButton,
              ]}
              onPress={() => handleOAuth("apple")}
              disabled={isLoading}
            >
              <Text style={styles.secondaryButtonText}>
                {copy.oauthLabel} with Apple
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
