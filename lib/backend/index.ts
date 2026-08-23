// The single place that names a backend. Screens import { auth, db, storage }
// from "@/lib/backend"; swapping providers is a change to this file and the
// adapter folder beside it.
//
// This branch is the Supabase implementation.

export { auth } from "./supabase/auth";
export { db } from "./supabase/db";
export { storage } from "./supabase/storage";

export type {
  AuthAdapter,
  AuthSubscription,
  BackendResult,
  BackendSession,
  BackendUser,
  DbAdapter,
  OAuthProvider,
  OAuthResult,
  StorageAdapter,
} from "./types";
