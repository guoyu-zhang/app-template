// Polyfills first: the Amplify SDK reaches for crypto.getRandomValues and a
// WHATWG URL during configure, and Hermes ships neither. Importing them below
// the Amplify import is too late.
import "react-native-get-random-values";
import "react-native-url-polyfill/auto";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";

import outputs from "@/amplify_outputs.json";

import type { Schema } from "@/amplify/data/resource";

/**
 * The Supabase branch reads two env vars and throws if they are missing. This
 * branch has the same contract with a different source: `npx ampx sandbox`
 * writes amplify_outputs.json, and the copy checked into git is a
 * shape-correct placeholder so a fresh clone still typechecks and bundles.
 *
 * Failing here — loudly, at import, naming the command — beats letting
 * Amplify.configure() accept empty strings and surfacing it later as an
 * unexplained 400 from Cognito.
 */
// Read through a widened type: the checked-in placeholder and the generated
// file have different shapes, and letting TS narrow on the literal one turns
// the second half of this check into dead code.
const configured = outputs as {
  $placeholder?: string;
  auth?: { user_pool_id?: string };
};

if (configured.$placeholder || !configured.auth?.user_pool_id) {
  throw new Error(
    "amplify_outputs.json is still the checked-in placeholder. Run " +
      "`npx ampx sandbox` to deploy the backend and generate the real one.",
  );
}

Amplify.configure(outputs);

/**
 * One client for the whole app. `generateClient` must run after configure, so
 * every module that talks to AppSync imports it from here rather than calling
 * generateClient itself.
 */
export const dataClient = generateClient<Schema>();
