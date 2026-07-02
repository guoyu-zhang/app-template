import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { type PurchasesPackage } from "react-native-purchases";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  configurePurchases,
  getCurrentPaywallPackages,
  purchasePaywallPackage,
  restorePurchasesAccess,
} from "@/lib/billing/purchases";
import { supabase } from "@/lib/supabase";

import { styles } from "./styles";

export default function PaywallScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [paywallPackages, setPaywallPackages] = useState<PurchasesPackage[]>(
    [],
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isActive = true;

    const loadPaywall = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        await configurePurchases(session?.user.id);
        const pkgs = await getCurrentPaywallPackages();
        if (!isActive) return;
        setPaywallPackages(pkgs);
      } catch {
        if (!isActive) return;
        setMessage("Could not load purchases. You can continue free for now.");
      } finally {
        if (!isActive) return;
        setIsLoading(false);
      }
    };

    loadPaywall();

    return () => {
      isActive = false;
    };
  }, []);

  const goToNotifications = () => {
    router.replace("/(onboarding)/notifications");
  };

  const handlePurchase = async (pkg: PurchasesPackage) => {
    setIsPurchasing(true);
    setMessage("");

    try {
      const hasAccess = await purchasePaywallPackage(pkg);
      if (hasAccess) {
        goToNotifications();
        return;
      }
      setMessage("Purchase completed, but access is not active yet.");
    } catch {
      setMessage("Purchase was not completed.");
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setIsPurchasing(true);
    setMessage("");

    try {
      const hasAccess = await restorePurchasesAccess();
      if (hasAccess) {
        goToNotifications();
        return;
      }
      setMessage("No previous purchase was found.");
    } catch {
      setMessage("Could not restore purchases.");
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Go Premium</Text>
        <Text style={styles.subtitle}>Unlock full access to all features.</Text>
        <View style={styles.onboardingCard}>
          <Text style={styles.onboardingText}>
            Premium includes unlimited usage, priority support, and early access
            to new tools.
          </Text>
        </View>
        {message ? <Text style={styles.message}>{message}</Text> : null}

        {paywallPackages.length > 0 ? (
          paywallPackages.map((pkg) => (
            <Pressable
              key={pkg.identifier}
              style={[
                styles.primaryButton,
                isPurchasing && styles.disabledButton,
                { marginBottom: 12 },
              ]}
              onPress={() => handlePurchase(pkg)}
              disabled={isPurchasing || isLoading}
            >
              {isPurchasing ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  Start {pkg.product.priceString} /{" "}
                  {pkg.product.subscriptionPeriod}
                </Text>
              )}
            </Pressable>
          ))
        ) : (
          <Pressable
            style={[styles.primaryButton, styles.disabledButton]}
            disabled={true}
          >
            <Text style={styles.primaryButtonText}>No plans available</Text>
          </Pressable>
        )}

        <Pressable
          style={[
            styles.secondaryButton,
            isPurchasing && styles.disabledButton,
          ]}
          onPress={handleRestore}
          disabled={isPurchasing || isLoading}
        >
          <Text style={styles.secondaryButtonText}>Restore Purchases</Text>
        </Pressable>
        <Pressable
          style={[
            styles.secondaryButton,
            isPurchasing && styles.disabledButton,
          ]}
          onPress={goToNotifications}
          disabled={isPurchasing}
        >
          <Text style={styles.secondaryButtonText}>Continue Free</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
