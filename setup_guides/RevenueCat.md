# RevenueCat Setup Guide

A step-by-step guide for setting up RevenueCat with subscription products for iOS and Android on Expo.

---

## Overview

RevenueCat sits between your app and the App Store / Google Play, handling receipt validation, subscription state, and renewals so you don't have to build that yourself. The setup has four main stages:

1. Create a RevenueCat project and connect your stores
2. Create products in App Store Connect and Google Play Console
3. Create matching products, entitlements, and offerings in RevenueCat
4. Configure the SDK in your Expo app

---

## 1. RevenueCat Project Setup

### Create a Project

- Sign up / log in at [app.revenuecat.com](https://app.revenuecat.com).
- Create a new **Project** — this is the top-level container for your apps, products, entitlements, and offerings.

### Connect Your Stores

Within the project, add each platform as an "app":

- **iOS app** — link to your App Store Connect app via its **Bundle ID** (`com.xlaris.apptemplate`, or your temporary bundle ID if you're still using one).
- **Android app** — link to your Google Play Console app via its **Package Name** (`com.xlaris.apptemplate`).

For iOS, you'll also need to generate an in-app purchase key (also under App Store Connect → Users and Access → Integrations) and put this in (app name -> Apps & Providers -> New App Store app)

After the in-app purchase key, you'll be asked to put in an **App Store Connect API Key** (under App Store Connect → Users and Access → Integrations), so RevenueCat can validate receipts and sync subscription status automatically.

For Android, you'll need a **Google Play service account** with access to your app, connected the same way — RevenueCat's Google Play setup guide walks through creating this in the Play Console.

> **Note:** RevenueCat gives you two SDK API keys after this step — one for iOS, one for Android. You'll use these later when configuring the SDK in your app.

---

## 2. Create Products in Each Store

Products have to exist in App Store Connect and Google Play Console _before_ RevenueCat can reference them. Create the same logical products on both platforms so they can later share one entitlement.

### Naming convention

Use a consistent pattern across platforms, e.g. `<app>_<entitlement>_<period>` — for example:

```
xlaris_premium_monthly
xlaris_premium_annual
```

> **Important:** Product IDs cannot be reused, even after deleting the product. Pick names you're willing to commit to.

### App Store Connect (iOS)

- Go to **App Store Connect → your app → Subscriptions** (or In-App Purchases, depending on product type).
- Create a new **Subscription Group** if you don't have one yet.
- Add each subscription product (e.g. Monthly, Annual), setting:
  - Product ID (matching your naming convention)
  - Billing period
  - Price tier
- Submit the metadata for review (subscriptions need basic info — display name, description — approved before they go live, though this can happen alongside your app's own review).

### Google Play Console (Android)

- Go to **Google Play Console → your app → Monetize → Products → Subscriptions**.
- Click **Create subscription**, set the **Product ID** (same naming as iOS) and a name.
- Add a **base plan** defining the billing period (monthly/annual) and renewal type (auto-renewing).
- Set the price and activate the base plan.

---

## 3. Configure Products, Entitlements, and Offerings in RevenueCat

This is where the two platforms' separate products get unified into one thing your app code checks against.

### Add Products

- In the RevenueCat dashboard, go to **Products → + New**.
- For each product, use the **exact same Product ID** you created in the store (e.g. `xlaris_premium_monthly`), and select the matching store (App Store or Google Play).
- Repeat for every product on every platform — so a "Monthly" plan will have one entry for iOS and one entry for Android, both pointing at the same conceptual plan.

### Create an Entitlement

- Go to **Entitlements → + New**.
- Create one entitlement representing the access level your products unlock — e.g. `premium`.
- Attach **all matching products** (iOS and Android versions of each plan) to this single entitlement.
- This is the key piece that lets your app check `customerInfo.entitlements.active['premium']` without caring which platform or which specific product the user actually bought.

### Create an Offering

- Go to **Offerings → + New**.
- Create an offering called `default` (or another identifier of your choice).
- Add **Packages** to it — e.g. a "Monthly" package and an "Annual" package — each linking to the corresponding iOS and Android products.
- This offering is what your paywall UI will fetch and display to users.

---

### Don't forget

- A **Restore Purchases** button somewhere in your app (both Apple and Google require this for review).
- Guard against an empty/missing API key on startup rather than crashing.
- Test using a development build, not Expo Go.

---

> **Note:** Product IDs must match exactly between the store listing and the RevenueCat product entry — a mismatch is the most common cause of "product not found" errors during testing.
