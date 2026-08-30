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
import {
  recallNativeProvider,
  signInWithProviderToken,
} from "./native-auth";

/**
 * Cognito stores metadata as declared custom attributes, so the app's
 * free-form `metadata` object round-trips through the `custom:` namespace.
 * Every key here must also exist in amplify/auth/resource.ts.
 */
const METADATA_PREFIX = "custom:";

/**
 * How long to wait for the Hub to report a redirect sign-in before treating
 * the silence as a dismissed browser. Long enough to cover a slow token
 * exchange on a bad connection; short enough that a user who backed out is
 * not left staring at a spinner.
 */
const OAUTH_GRACE_MS = 15_000;

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
 * An account created from a native provider token is, to Cognito, an ordinary
 * user pool account: there is no `identities` claim to read a provider off,
 * because no federation took place. The device remembers which sheet the user
 * came through, and that is the only place that knowledge exists.
 *
 * Only consulted when the token says "email", so a federated session always
 * wins over a stale local note.
 */
async function resolveProvider(
  fromToken: string,
  userId: string,
): Promise<string> {
  if (fromToken !== "email") return fromToken;
  return (await recallNativeProvider(userId)) ?? fromToken;
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
        provider: await resolveProvider(
          providerFrom(tokens.idToken?.payload),
          userId,
        ),
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
   * Cognito has no endpoint that trades a provider token for a session, so the
   * pool grows one: a custom auth challenge whose answer is the token, checked
   * by a Lambda against Apple's or Google's public keys. The mechanics are in
   * ./native-auth; from here it is an ordinary sign-in that happens to be
   * answered with a JWT instead of a password.
   *
   * This is what keeps the Apple and Google buttons on the system sheet rather
   * than in a browser showing the pool's generated hosted-UI domain.
   */
  async signInWithIdToken({ provider, token }) {
    try {
      await signInWithProviderToken({ provider, token });
      return { error: null };
    } catch (error) {
      return { error: asError(error) };
    }
  },

  /**
   * `signInWithRedirect` opens the Cognito hosted UI, which returns to the
   * app's scheme. Unlike the Supabase branch there are no tokens in the
   * return URL to hand back: Amplify exchanges the code itself and announces
   * the result on the Hub.
   *
   * That exchange finishes *after* the promise below resolves — the promise
   * tracks the browser closing, not the sign-in completing. Reading the
   * session straight afterwards therefore races it, and loses often enough
   * that a successful sign-in reads as a cancelled one. So: subscribe first
   * (an event fired before the listener exists is gone), start the flow, then
   * wait for the Hub to speak.
   *
   * A dismissed browser produces no event at all, which is indistinguishable
   * from a slow exchange until enough time has passed. Hence the grace period,
   * and the session check before calling it cancelled — silence is the one
   * outcome the Hub cannot report.
   */
  async signInWithOAuth({ provider }): Promise<OAuthResult> {
    let settle: (result: OAuthResult) => void = () => {};
    const settled = new Promise<OAuthResult>((resolve) => {
      settle = resolve;
    });

    const stopListening = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signInWithRedirect") {
        settle({ error: null });
      } else if (payload.event === "signInWithRedirect_failure") {
        const failure = (payload as { data?: { error?: unknown } }).data?.error;
        settle({ error: asError(failure ?? new Error("OAuth sign-in failed.")) });
      }
    });

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      await signInWithRedirect({
        provider: provider === "apple" ? "Apple" : "Google",
      });

      const graced = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), OAUTH_GRACE_MS);
      });

      const result = await Promise.race([settled, graced]);
      if (result) return result;

      return (await currentSession())
        ? { error: null }
        : { error: null, cancelled: true };
    } catch (error) {
      const message = asError(error).message;
      // Amplify reports a dismissed browser sheet as a thrown error on some
      // platforms and as silence on others; the screen should fall quiet for
      // both, not show a failure.
      if (/cancell?ed|closed|user_cancel/i.test(message)) {
        return { error: null, cancelled: true };
      }
      return { error: asError(error) };
    } finally {
      stopListening();
      if (timer) clearTimeout(timer);
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
