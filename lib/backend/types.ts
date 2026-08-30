// The contract every backend adapter implements. Screens import from
// `@/lib/backend` and never from a vendor SDK, so swapping Supabase for
// Amplify is a change to this folder rather than to every screen.

export type BackendUser = {
  id: string;
  email?: string;
  /** Provider-specific user metadata (push_token, onboarding flags, ...). */
  metadata: Record<string, unknown>;
  /**
   * How this user signs in: "email" for password accounts, otherwise the
   * social provider. Screens use it to decide whether a password reset makes
   * sense.
   */
  provider?: string;
};

export type BackendSession = {
  user: BackendUser;
  accessToken: string;
};

export type OAuthProvider = "google" | "apple";

/**
 * Adapters report failure in the return value rather than throwing, matching
 * how the screens already handle errors.
 */
export type BackendResult = { error: Error | null };

/**
 * A dismissed browser sheet is neither success nor failure — the screen should
 * stop without showing an error.
 */
export type OAuthResult = BackendResult & { cancelled?: boolean };

export type AuthSubscription = { unsubscribe: () => void };

export interface AuthAdapter {
  /**
   * Whether `signInWithIdToken` can actually be used. Supabase exchanges a
   * native Apple/Google token directly; Cognito has no equivalent, so on that
   * backend the native sign-in sheet produces a token nothing can spend.
   *
   * Screens read this to choose the sign-in path *before* prompting, rather
   * than putting the user through a native sheet and then a browser. Absent
   * means supported, so an adapter only sets it to opt out.
   */
  readonly supportsNativeIdToken?: boolean;

  getSession(): Promise<BackendSession | null>;

  signInWithPassword(params: {
    email: string;
    password: string;
  }): Promise<BackendResult>;

  signUp(params: { email: string; password: string }): Promise<BackendResult>;

  /**
   * Sign in with a token obtained natively (Apple's identityToken, Google's
   * idToken). Not every provider supports this — Cognito, for one, has no
   * equivalent — so adapters may reject it and force `signInWithOAuth`.
   */
  signInWithIdToken(params: {
    provider: OAuthProvider;
    token: string;
    nonce?: string;
  }): Promise<BackendResult>;

  /**
   * Full browser-based OAuth flow, including opening the auth session and
   * establishing the session on return. The plumbing differs per provider, so
   * it lives behind this call rather than in the screen.
   */
  signInWithOAuth(params: {
    provider: OAuthProvider;
    redirectTo: string;
  }): Promise<OAuthResult>;

  signOut(): Promise<BackendResult>;

  resetPassword(email: string): Promise<BackendResult>;

  updateUserMetadata(
    metadata: Record<string, unknown>,
  ): Promise<BackendResult>;

  /** Deletes the signed-in user's account and clears the local session. */
  deleteAccount(): Promise<BackendResult>;

  onAuthStateChange(
    callback: (session: BackendSession | null) => void,
  ): AuthSubscription;
}

export interface DbAdapter {
  submitContactMessage(params: {
    userId: string;
    category: string;
    message: string;
  }): Promise<BackendResult>;
}

export interface StorageAdapter {
  /** Uploads a local file URI and returns the stored object's path. */
  upload(params: {
    bucket: string;
    path: string;
    uri: string;
    contentType?: string;
  }): Promise<{ path: string | null; error: Error | null }>;

  /** Resolves a stored object to a URL the app can render. */
  getUrl(params: {
    bucket: string;
    path: string;
  }): Promise<{ url: string | null; error: Error | null }>;

  remove(params: { bucket: string; paths: string[] }): Promise<BackendResult>;
}
