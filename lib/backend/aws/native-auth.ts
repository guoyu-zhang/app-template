import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  confirmSignIn,
  getCurrentUser,
  signIn,
  signOut,
  signUp,
} from "aws-amplify/auth";

import {
  NATIVE_PROVIDER_METADATA_KEY,
  NATIVE_TOKEN_METADATA_KEY,
} from "@/amplify/auth/native-token/config";

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
 * The account may not exist yet, and Cognito will not create one mid-challenge,
 * so a failed start is followed by a sign-up and one retry. The sign-up carries
 * the token as client metadata, which is what lets the pre-sign-up trigger
 * confirm the account without emailing a code.
 */

const NATIVE_PROVIDER_STORAGE_KEY = "auth.native-provider";

/** Every class Cognito's default password policy insists on, once each. */
const PASSWORD_GROUPS = [
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "abcdefghijklmnopqrstuvwxyz",
  "0123456789",
  "!@#$%^&*()-_=+",
];

function errorName(error: unknown): string {
  return (error as { name?: string })?.name ?? "";
}

/**
 * A password the account needs to have and nobody needs to know. Sign-in goes
 * through the provider token; this exists only because Cognito's sign-up API
 * demands a password, and leaving it guessable would be a second, weaker door
 * into the same account.
 */
function randomPassword(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const alphabet = PASSWORD_GROUPS.join("");
  const filler = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]);
  const required = PASSWORD_GROUPS.map(
    (group, index) => group[bytes[index] % group.length],
  );
  return [...required, ...filler].join("");
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

export async function signInWithProviderToken(params: {
  provider: OAuthProvider;
  token: string;
}): Promise<void> {
  const { provider, token } = params;
  const email = emailFromToken(token);
  const challengeResponse = JSON.stringify({ provider, token });

  let firstFailure: unknown;
  try {
    await answerChallenge(email, challengeResponse);
    await rememberNativeProvider(provider);
    return;
  } catch (error) {
    /**
     * An account that exists but was never confirmed cannot be signed into and
     * cannot be signed up again. Only its owner can finish it, with the code
     * that was emailed when it was created.
     */
    if (errorName(error) === "UserNotConfirmedException") {
      throw new Error(
        "This email already has an unconfirmed account. Sign in with your email and password to finish confirming it.",
      );
    }
    firstFailure = error;
  }

  try {
    await signUp({
      username: email,
      password: randomPassword(),
      options: {
        userAttributes: { email },
        clientMetadata: {
          [NATIVE_PROVIDER_METADATA_KEY]: provider,
          [NATIVE_TOKEN_METADATA_KEY]: token,
        },
      },
    });
  } catch (error) {
    /**
     * The account was there all along, so the sign-in failure above was the
     * real answer — a rejected token, most likely — and reporting this one
     * instead would send whoever reads the log looking in the wrong place.
     */
    if (errorName(error) === "UsernameExistsException") {
      throw firstFailure;
    }
    throw error;
  }

  await answerChallenge(email, challengeResponse);
  await rememberNativeProvider(provider);
}

/**
 * Which provider a native sign-in came through, remembered on the device.
 *
 * A federated (hosted UI) account carries an `identities` claim that says so;
 * an account created from a provider token looks exactly like an email one to
 * Cognito, and the app uses the difference to decide whether to offer a
 * password change and what to show on the account screen. Recording it as a
 * custom attribute would mean adding one to a live user pool, which is a
 * heavier and less reversible change than a value on the device.
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
