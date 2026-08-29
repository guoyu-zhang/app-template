import Constants from "expo-constants";

/**
 * The App Store-facing legal pages, set once per app in `app.json` under
 * `expo.extra` and read from here by anything that links to them.
 *
 * They live in app.json rather than `.env` because .env is gitignored: a
 * value there is lost on a fresh clone and never reaches an EAS build, and
 * an empty privacy link is the kind of thing App Review catches instead of us.
 *
 * Apple opens both pages during review, so these are per app — a policy
 * written for another app does not describe this one's data collection.
 */
const extra = Constants.expoConfig?.extra ?? {};

export const PRIVACY_URL: string = extra.privacyUrl ?? "";
export const TERMS_URL: string = extra.termsUrl ?? "";
