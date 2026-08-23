import { Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesPackage,
} from "react-native-purchases";

const APPLE_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY;
const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY;
const ENTITLEMENT_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? "pro";

let isConfigured = false;

function getRevenueCatApiKey() {
  const apiKey = Platform.OS === "ios" ? APPLE_API_KEY : GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error("Missing RevenueCat API key for current platform.");
  }

  return apiKey;
}

function getEntitlementId() {
  return ENTITLEMENT_ID;
}

function hasEntitlement(customerInfo: CustomerInfo) {
  return Boolean(customerInfo.entitlements.active[getEntitlementId()]);
}

export async function configurePurchases(userId?: string) {
  if (Platform.OS === "web") {
    return false;
  }

  if (!isConfigured) {
    Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({
      apiKey: getRevenueCatApiKey(),
      appUserID: userId,
    });
    isConfigured = true;
    return true;
  }

  if (userId) {
    await Purchases.logIn(userId);
  }

  return true;
}

export async function getCurrentPaywallPackages() {
  const offerings = await Purchases.getOfferings();
  const currentOffering = offerings.current;

  if (!currentOffering) {
    return [];
  }

  return currentOffering.availablePackages;
}

export async function purchasePaywallPackage(pkg: PurchasesPackage) {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return hasEntitlement(customerInfo);
}

export async function restorePurchasesAccess() {
  const customerInfo = await Purchases.restorePurchases();
  return hasEntitlement(customerInfo);
}

/**
 * Whether this platform can redeem App Store offer codes at all.
 *
 * The redemption sheet is StoreKit's, so it exists only on iOS. Play has no
 * equivalent an app can open, which is why the entry point is hidden rather
 * than shown-and-failing on Android.
 */
export function canRedeemOfferCode() {
  return Platform.OS === "ios";
}

/**
 * Open the App Store's offer code redemption sheet and report whether the
 * customer came back entitled.
 *
 * Apple owns the code field — the app never sees the code and never applies
 * the discount itself. The sheet also resolves without saying what happened
 * inside it, so entitlement is re-read afterwards rather than inferred from
 * the call returning.
 */
export async function redeemOfferCode() {
  if (!canRedeemOfferCode()) {
    return false;
  }

  await Purchases.presentCodeRedemptionSheet();
  const customerInfo = await Purchases.getCustomerInfo();
  return hasEntitlement(customerInfo);
}
