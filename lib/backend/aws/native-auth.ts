import AsyncStorage from "@react-native-async-storage/async-storage";
import { confirmSignIn, getCurrentUser, signIn, signOut } from "aws-amplify/auth";

import outputs from "@/amplify_outputs.json";

import type { OAuthProvider } from "../types";

import "./client";

/**
 * Signing in with the token from the Apple or Google system sheet.
 *
 * Cognito has no API for this — no `signInWithIdToken`, no exchange endpoint —
 * so the pool defines a custom auth challenge whose answer is the provider
 * token, and a Lambda verifies it (amplify/auth/native-token). From here that
 * looks like an ordinary two-step sign-in: start the flow, send the token.
 *
 * The account may not exist yet, and Cognito will not create one mid-challenge.
 * Rather than have the device create it — which would mean handing Cognito the
 * token as unencrypted client metadata and choosing a password for an account
 * that should not have a usable one — a failed start goes to the provisioning
 * endpoint, which verifies the same token server-side, and the sign-in is
 * tried once more.
 */

const NATIVE_PROVIDER_STORAGE_KEY = "auth.native-provider";

const PROVISION_URL = (
  outputs as { custom?: { provision_native_user_url?: string } }
).custom?.provision_native_user_url;

function errorName(error: unknown): string {
  return (error as { name?: string })?.name ?? "";
}

/**
 * A value the provider stamps into the token it mints, so a token can be tied
 * to the sign-in that asked for it rather than floating free. Apple supports
 * this; the Google Sign-In API here does not, and its tokens carry no nonce.
 *
 * Either way it is not what stops a replay — the backend records every token
 * it has spent, which is. This narrows what a token that leaks is good for.
 */
export function createSignInNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/**
 * Reads the email out of a provider token without verifying anything — the
 * signature is checked in the Lambda, on a copy the device cannot edit. All
 * this decides is which username to start the flow with, and a lie here can
 * only produce a sign-in the backend then refuses.
 *
 * Hand-rolled because Hermes has no Buffer and `atob` is not on every
 * platform this app runs on. The claims that matter are ASCII.
 */
const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function decodeBase64Url(segment: string): string {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  let bits = 0;
  let accumulator = 0;
  let decoded = "";
  for (const character of normalized) {
    const index = BASE64_ALPHABET.indexOf(character);
    if (index === -1) continue;
    accumulator = (accumulator << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      decoded += String.fromCharCode((accumulator >> bits) & 0xff);
    }
  }
  return decoded;
}

function emailFromToken(token: string): string {
  const [, payload] = token.split(".");
  if (!payload) throw new Error("Provider token is not a JWT.");
  const claims = JSON.parse(decodeBase64Url(payload)) as { email?: unknown };
  if (typeof claims.email !== "string" || !claims.email) {
    throw new Error(
      "The provider did not return an email address, so there is no account to sign in to.",
    );
  }
  return claims.email.toLowerCase();
}

async function answerChallenge(
  username: string,
  challengeResponse: string,
): Promise<void> {
  const start = async () =>
    signIn({ username, options: { authFlowType: "CUSTOM_WITHOUT_SRP" } });

  let output;
  try {
    output = await start();
  } catch (error) {
    // A session left over from a previous account blocks a new sign-in, and
    // the user asking for one has already said which account they want.
    if (errorName(error) !== "UserAlreadyAuthenticatedException") throw error;
    await signOut();
    output = await start();
  }

  if (output.isSignedIn) return;
  if (output.nextStep.signInStep !== "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE") {
    throw new Error(
      `Unexpected next step for provider sign-in: ${output.nextStep.signInStep}.`,
    );
  }

  const confirmed = await confirmSignIn({ challengeResponse });
  if (!confirmed.isSignedIn) {
    throw new Error("The provider token was not accepted.");
  }
}

/**
 * Asks the backend to create the account, or to attach this identity to one
 * that already has the same verified address. Idempotent, so retrying a
 * sign-in does not accumulate anything.
 */
async function provisionAccount(body: {
  provider: OAuthProvider;
  token: string;
  nonce?: string;
}): Promise<void> {
  if (!PROVISION_URL) {
    throw new Error(
      "No provisioning endpoint in amplify_outputs.json. Run `npx ampx sandbox`.",
    );
  }

  const response = await fetch(PROVISION_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(detail?.error ?? "Sign-in was refused.");
  }
}

export async function signInWithProviderToken(params: {
  provider: OAuthProvider;
  token: string;
  nonce?: string;
}): Promise<void> {
  const { provider, token, nonce } = params;
  const email = emailFromToken(token);
  const challengeResponse = JSON.stringify({ provider, token, nonce });

  try {
    await answerChallenge(email, challengeResponse);
    await rememberNativeProvider(provider);
    return;
  } catch (error) {
    /**
     * An account that exists but was never confirmed cannot be signed into and
     * cannot be provisioned around. Only its owner can finish it, with the code
     * that was emailed when it was created.
     */
    if (errorName(error) === "UserNotConfirmedException") {
      throw new Error(
        "This email already has an unconfirmed account. Sign in with your email and password to finish confirming it.",
      );
    }
  }

  /**
   * Either there is no account yet, or there is one this identity has never
   * been attached to. Both are the provisioning endpoint's job, and both of
   * its refusals are more specific than the sign-in failure above — so its
   * error is the one worth showing.
   */
  await provisionAccount({ provider, token, nonce });
  await answerChallenge(email, challengeResponse);
  await rememberNativeProvider(provider);
}

/**
 * Which provider a native sign-in came through, remembered on the device.
 *
 * A federated (hosted UI) account carries an `identities` claim that says so;
 * an account created from a provider token looks exactly like an email one to
 * Cognito, and the app uses the difference to decide whether to offer a
 * password change and what to show on the account screen. The pool does store
 * the identity, but not anywhere an ID token exposes it.
 */
async function rememberNativeProvider(provider: OAuthProvider): Promise<void> {
  try {
    const { userId } = await getCurrentUser();
    await AsyncStorage.setItem(
      NATIVE_PROVIDER_STORAGE_KEY,
      JSON.stringify({ userId, provider }),
    );
  } catch {
    // Cosmetic: a missed write costs a label on the account screen, not a
    // sign-in, and there is nothing useful to do about it here.
  }
}

export async function recallNativeProvider(
  userId: string,
): Promise<string | undefined> {
  try {
    const stored = await AsyncStorage.getItem(NATIVE_PROVIDER_STORAGE_KEY);
    if (!stored) return undefined;
    const parsed = JSON.parse(stored) as { userId?: string; provider?: string };
    return parsed.userId === userId ? parsed.provider : undefined;
  } catch {
    return undefined;
  }
}
