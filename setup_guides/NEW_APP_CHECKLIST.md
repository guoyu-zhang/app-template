# New App Checklist

Everything to redo when forking this template. Ordered by dependency — later steps need IDs from earlier ones.

See `authentication.md` and `RevenueCat.md` for the *how*; this is the *what* and *in what order*.

---

## Reuse — never redo these

- Apple Developer membership, Team ID `2SWSWS8SCA`
- `secrets/AuthKey_M4JWHCQM23.p8` — App Store Connect API key
- `secrets/SubscriptionKey_HDQT4XWQ9W.p8` — in-app purchase key
- Google Play developer account · Expo account (`guoyu-zhang`)
- GCP OAuth consent screen — if you reuse Cloud project `187798873933`
- `xlaris.com/privacy` + `/terms`

RevenueCat gets a **new project per app**. Firebase/GCP can be shared (skips the consent screen).

The backend is the exception: on AWS every app lives in **one account**, because
the 10,000 free Cognito MAU is per account and separate accounts would waste it.
(On the `supabase` branch it is a project per app.)

---

## 0. Decide up front

Bundle ID (same for iOS + Android) · app name/slug/scheme · entitlement name · product IDs (`<app>_<entitlement>_<period>`).

Product IDs can never be reused, even after deletion. Pick carefully.

## 1. EAS

- [ ] `eas init` → new `projectId`
- [ ] `eas credentials -p android` → keystore + **SHA-1** (needed in step 3)

## 2. Apple

Scripted — see `scripts/asc_setup.py` (needs `ASC_ISSUER_ID`, see its docstring).

- [ ] `asc_setup.py whoami` — confirm credentials
- [ ] `asc_setup.py register-bundle-id --identifier <id> --name "<name>"`
- [ ] Create App Store Connect app record — **web UI only**, no API exists
- [ ] `asc_setup.py check-app --identifier <id>` — confirms the record and prints
      the numeric ID for `EXPO_PUBLIC_IOS_APP_STORE_ID`
- [ ] Register App Group `group.<bundle-id>` (only if using the widget)

## 3. Firebase + Google Cloud

- [ ] Register iOS + Android apps in Firebase
- [ ] Download `google-services.json` → `secrets/` (`firebase apps:sdkconfig`)
- [ ] Add the SHA-1 from step 1 (`firebase apps:android:sha:create`)
- [ ] OAuth client — **Web** → used by Cognito + `webClientId`
- [ ] OAuth client — **iOS** (needs bundle ID) → `iosClientId` + `iosUrlScheme`
- [ ] OAuth client — **Android** (needs package + SHA-1) → not referenced in code, just must exist

## 4. AWS Amplify

Run `python3 ~/Projects/app-setup/scripts/amplify_setup.py gates` for the full
list with links — seven browser steps, five of them once per account.

- [ ] The account-level gates: AWS account (Paid plan), root MFA, budget alert,
      SES production access
- [ ] Google OAuth client + secret, Apple Service ID + `.p8`
- [ ] `npm create amplify@latest` -> `amplify/`
- [ ] Define `amplify/{auth,data,storage}/resource.ts`
- [ ] `npx ampx sandbox` -> `amplify_outputs.json`
- [ ] `amplify_setup.py create --name "<App>"` -> appId for CI deploys
- [ ] **Test Apple/Google sign-in on a real device** — Cognito has no
      equivalent of Supabase's `signInWithIdToken`, so it opens a browser
      webview instead of the native sheet. Check this before building anything
      else on top.

## 5. Store products

- [ ] App Store Connect → subscription group + products
- [ ] Google Play → create app record, then subscriptions + base plans
- [ ] Google Play → service account for RevenueCat

## 6. RevenueCat

- [ ] New project; add iOS app (bundle ID + both `.p8` keys) and Android app (package + service account)
- [ ] Products — IDs must match the stores **exactly**
- [ ] One entitlement, all products attached
- [ ] Offering `default` with packages
- [ ] Copy both SDK API keys

## 7. PostHog

- [ ] New project → API key (host stays `https://eu.i.posthog.com`)

## 8. Push credentials

Not in the old guides, easy to miss — notifications silently never arrive without these.

- [ ] iOS: APNs key uploaded to EAS
- [ ] Android: FCM V1 service account uploaded to EAS

---

## Code touchpoints

| File | Change |
|---|---|
| `app.json` | `name`, `slug`, `scheme`, `ios.bundleIdentifier`, `android.package`, `iosUrlScheme`, app group, `extra.eas.projectId` |
| `.env` | all 8 vars |
| `app/(onboarding)/auth-form.tsx:27,29` | `webClientId`, `iosClientId` |
| `app/(tabs)/settings.tsx:202,211` | privacy + terms URLs |
| `targets/*/expo-target.config.js` | app group — **must match `app.json`** |
| `secrets/google-services.json` | replace wholesale |

> The older guides say to edit `signin.tsx`/`signup.tsx` — those were merged into `auth-form.tsx`.

---

## Gotchas

Every one of these fails silently at runtime, not at build:

- **Entitlement ID** — no spaces, no quotes in `.env`. A mismatch means no user is ever premium.
- **App Group** — lives in two files. Miss one and the widget renders empty.
- **`google-services.json`** — must contain exactly your package. Wrong file breaks Google Sign-In on Android only, on device only.
- **`EXPO_PUBLIC_IOS_APP_STORE_ID`** — leave unset until the listing exists. The template shipped Instagram's ID (`389801252`) as a placeholder.
- **`EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY`** — template ships `your_google_api_key_here`.
- Auth and purchases need a dev build. Neither works in Expo Go.

## Verify before shipping

- [ ] `grep -rn "xlaris\|apptemplate\|187798873933" app.json app lib targets` returns only intentional hits
- [ ] Google Sign-In works on a physical Android device
- [ ] A sandbox purchase flips the entitlement
- [ ] Push notification arrives on both platforms
