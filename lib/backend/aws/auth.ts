import {
  deleteUser,
  fetchAuthSession,
  fetchUserAttributes,
  getCurrentUser,
  resetPassword as cognitoResetPassword,
  signIn,
  signInWithRedirect,
  signOut as cognitoSignOut,
  signUp as cognitoSignUp,
  updateUserAttributes,
} from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";

import type {
  AuthAdapter,
  AuthSubscription,
  BackendSession,
  OAuthResult,
} from "../types";

import "./client";
import { purgeOwnedRows } from "./db";

/**
 * Cognito stores metadata as declared custom attributes, so the app's
 * free-form `metadata` object round-trips through the `custom:` namespace.
 * Every key here must also exist in amplify/auth/resource.ts.
 */
const METADATA_PREFIX = "custom:";

/**
 * Which identity provider the user came in through. Cognito puts federated
 * origins in an `identities` claim on the ID token; a user pool account has
 * no such claim, and the app calls that "email" because that is the only
 * thing the settings screen does with it (decide whether a password reset is
 * offered).
 */
function providerFrom(idTokenPayload: Record<string, unknown> | undefined) {
  const identities = idTokenPayload?.identities;
  if (Array.isArray(identities) && identities.length > 0) {
    const name = (identities[0] as { providerName?: string })?.providerName;
    if (name) return name.toLowerCase();
  }
  return "email";
}

/**
 * Reads the pieces of a session that live in three different places: the
 * tokens, the user id, and the attributes. Returns null rather than throwing
 * when nobody is signed in, because that is the ordinary case on cold start
 * and `fetchAuthSession` reports it by returning empty tokens.
 */
async function currentSession(): Promise<BackendSession | null> {
  try {
    const { tokens } = await fetchAuthSession();
    if (!tokens?.accessToken) return null;

    const { userId } = await getCurrentUser();
    const attributes = await fetchUserAttributes();

    const metadata: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (key.startsWith(METADATA_PREFIX)) {
        metadata[key.slice(METADATA_PREFIX.length)] = value;
      }
    }

    return {
      user: {
        id: userId,
        email: attributes.email ?? undefined,
        metadata,
        provider: providerFrom(tokens.idToken?.payload),
      },
      accessToken: tokens.accessToken.toString(),
    };
  } catch {
    // Not signed in, or the refresh token expired. Both are "no session".
    return null;
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export const auth: AuthAdapter = {
  /**
   * Cognito cannot exchange an Apple `identityToken` or a Google `idToken`
   * for a user pool session — there is no equivalent of Supabase's
   * `signInWithIdToken`. Screens read this to skip the native sign-in sheet
   * and go straight to the browser flow, rather than putting the user
   * through a native prompt whose result is unusable.
   */
  supportsNativeIdToken: false,

  async getSession() {
    return currentSession();
  },

  async signInWithPassword({ email, password }) {
    try {
      await signIn({ username: email, password });
      return { error: null };
    } catch (error) {
      return { error: asError(error) };
    }
  },

  async signUp({ email, password }) {
    try {
      await cognitoSignUp({
        username: email,
        password,
        options: { userAttributes: { email } },
      });
      return { error: null };
    } catch (error) {
      return { error: asError(error) };
    }
  },

  /**
   * Kept on the interface so both branches stay type-compatible, and kept
   * failing rather than silently redirecting: a caller that reached here
   * has already shown the user a native sheet, and opening a browser to
   * repeat the whole thing is worse than an honest error. `supportsNativeIdToken`
   * is how a screen avoids getting here at all.
   */
  async signInWithIdToken() {
    return {
      error: new Error(
        "Cognito cannot exchange a native provider token; use signInWithOAuth.",
      ),
    };
  },

  /**
   * `signInWithRedirect` opens the Cognito hosted UI, which returns to the
   * app's scheme. Unlike the Supabase branch there are no tokens in the
   * return URL to hand back — Amplify stores the session itself and announces
   * it on the Hub — so success is "a session exists afterwards", and the
   * user closing the browser is reported as cancelled rather than as failure.
   */
  async signInWithOAuth({ provider }): Promise<OAuthResult> {
    try {
      await signInWithRedirect({
        provider: provider === "apple" ? "Apple" : "Google",
      });

      const session = await currentSession();
      if (!session) return { error: null, cancelled: true };
      return { error: null };
    } catch (error) {
      const message = asError(error).message;
      // Amplify reports a dismissed browser sheet as a thrown error; the
      // screen should fall silent for it, not show a failure.
      if (/cancell?ed|closed|user_cancel/i.test(message)) {
        return { error: null, cancelled: true };
      }
      return { error: asError(error) };
    }
  },

  async signOut() {
    try {
      await cognitoSignOut();
      return { error: null };
    } catch (error) {
      return { error: asError(error) };
    }
  },

  /**
   * Cognito's built-in sender is capped at 50 messages/day account-wide, which
   * will not carry a real app's password resets. The cap is an SES production
   * access request, not a code change.
   */
  async resetPassword(email) {
    try {
      await cognitoResetPassword({ username: email });
      return { error: null };
    } catch (error) {
      return { error: asError(error) };
    }
  },

  /**
   * Values are stringified because Cognito attributes are flat strings —
   * there is no JSON column here. Undefined and null clear an attribute
   * rather than writing the literal words.
   */
  async updateUserMetadata(metadata) {
    try {
      const userAttributes: Record<string, string> = {};
      for (const [key, value] of Object.entries(metadata)) {
        userAttributes[`${METADATA_PREFIX}${key}`] =
          value === undefined || value === null
            ? ""
            : typeof value === "string"
              ? value
              : JSON.stringify(value);
      }
      await updateUserAttributes({ userAttributes });
      return { error: null };
    } catch (error) {
      return { error: asError(error) };
    }
  },

  /**
   * Two calls, in this order. `deleteUser` removes the Cognito identity but
   * leaves the user's DynamoDB rows behind, and once the identity is gone
   * owner authorization makes those rows unreachable by anyone — so they have
   * to go first, while the caller can still prove they own them.
   */
  async deleteAccount() {
    try {
      const purgeError = await purgeOwnedRows();
      if (purgeError) return { error: purgeError };

      await deleteUser();
      // deleteUser already clears the local session; signOut would throw.
      return { error: null };
    } catch (error) {
      return { error: asError(error) };
    }
  },

  /**
   * The Hub carries the event but not the session, so each event triggers a
   * read. Sign-out is answered without one — there is nothing to fetch, and
   * asking would only produce the null we already know.
   */
  onAuthStateChange(callback): AuthSubscription {
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      switch (payload.event) {
        case "signedIn":
        case "signInWithRedirect":
        case "tokenRefresh":
          currentSession().then(callback);
          break;
        case "signedOut":
        case "tokenRefresh_failure":
        case "signInWithRedirect_failure":
          callback(null);
          break;
        default:
          break;
      }
    });
    return { unsubscribe };
  },
};
