import type { AuthAdapter, AuthSubscription, OAuthResult } from "../types";

import { notImplemented } from "./not-implemented";

/**
 * Cognito-backed auth. See ./README.md for the mapping and the open questions
 * (native ID tokens, SES, account deletion) that must be settled first.
 */
export const auth: AuthAdapter = {
  // -> fetchAuthSession() + getCurrentUser() from "aws-amplify/auth"
  async getSession() {
    return notImplemented("auth.getSession");
  },

  // -> signIn({ username, password })
  async signInWithPassword() {
    return notImplemented("auth.signInWithPassword");
  },

  // -> signUp({ username, password, options: { userAttributes: { email } } })
  async signUp() {
    return notImplemented("auth.signUp");
  },

  /**
   * Cognito has no direct equivalent. Native Apple/Google tokens cannot be
   * exchanged for a user pool session, so callers must fall back to
   * `signInWithOAuth`. Kept on the interface so the Supabase branch and this
   * one stay type-compatible.
   */
  async signInWithIdToken() {
    return {
      error: new Error(
        "Cognito cannot exchange a native provider token; use signInWithOAuth.",
      ),
    };
  },

  // -> signInWithRedirect({ provider: "Google" | "Apple" })
  async signInWithOAuth(): Promise<OAuthResult> {
    return notImplemented("auth.signInWithOAuth");
  },

  // -> signOut()
  async signOut() {
    return notImplemented("auth.signOut");
  },

  // -> resetPassword({ username }); delivery requires SES in production
  async resetPassword() {
    return notImplemented("auth.resetPassword");
  },

  // -> updateUserAttributes({ userAttributes: { "custom:push_token": ... } })
  // Cognito attributes are flat strings and must be declared in the user pool
  // schema, unlike Supabase's free-form JSON metadata.
  async updateUserMetadata() {
    return notImplemented("auth.updateUserMetadata");
  },

  // -> deleteUser(), plus a Lambda to remove the user's DynamoDB rows
  async deleteAccount() {
    return notImplemented("auth.deleteAccount");
  },

  // -> Hub.listen("auth", ...) from "aws-amplify/utils"
  onAuthStateChange(): AuthSubscription {
    return { unsubscribe: () => {} };
  },
};
