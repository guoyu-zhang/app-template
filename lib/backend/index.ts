// The single place that names a backend. Screens import { auth, db, storage }
// from "@/lib/backend"; swapping providers is a change to this file and the
// adapter folder beside it.
//
// This branch (main) is the AWS/Amplify line. The Supabase implementation of
// the same interface lives on the `supabase` branch.

export { auth } from "./aws/auth";
export { db } from "./aws/db";
export { storage } from "./aws/storage";

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
