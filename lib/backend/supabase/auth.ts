import * as WebBrowser from "expo-web-browser";

import type {
  AuthAdapter,
  AuthSubscription,
  BackendSession,
  OAuthResult,
} from "../types";

import { supabase } from "./client";

import type { Session } from "@supabase/supabase-js";

function toSession(session: Session | null): BackendSession | null {
  if (!session?.user) return null;
  return {
    user: {
      id: session.user.id,
      email: session.user.email ?? undefined,
      metadata: session.user.user_metadata ?? {},
      provider: session.user.app_metadata?.provider,
    },
    accessToken: session.access_token,
  };
}

export const auth: AuthAdapter = {
  async getSession() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return toSession(session);
  },

  async signInWithPassword({ email, password }) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  },

  async signUp({ email, password }) {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error };
  },

  async signInWithIdToken({ provider, token }) {
    const { error } = await supabase.auth.signInWithIdToken({
      provider,
      token,
    });
    return { error };
  },

  async signInWithOAuth({ provider, redirectTo }): Promise<OAuthResult> {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });

    if (error) return { error };
    if (!data?.url) return { error: new Error("Unable to start OAuth flow.") };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    // Dismissed or cancelled: not an error, but there is no session either.
    if (result.type !== "success") {
      return { error: null, cancelled: true };
    }

    const hash = result.url.includes("#") ? result.url.split("#")[1] : "";
    const params = new URLSearchParams(hash);
    const errorDescription = params.get("error_description");
    if (errorDescription) return { error: new Error(errorDescription) };

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) {
      return { error: new Error("OAuth sign-in failed to return tokens.") };
    }

    const { error: setSessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return { error: setSessionError };
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    return { error };
  },

  async resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error };
  },

  async updateUserMetadata(metadata) {
    const { error } = await supabase.auth.updateUser({ data: metadata });
    return { error };
  },

  async deleteAccount() {
    // `delete_user` is a security definer function that removes the row from
    // auth.users; see supabase_sql/delete_acc.sql.
    const { error } = await supabase.rpc("delete_user");
    if (error) return { error };
    const { error: signOutError } = await supabase.auth.signOut();
    return { error: signOutError };
  },

  onAuthStateChange(callback): AuthSubscription {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(toSession(session));
    });
    return { unsubscribe: () => subscription.unsubscribe() };
  },
};
