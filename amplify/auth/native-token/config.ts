/**
 * What the native sign-in tokens are checked against.
 *
 * A token from Apple or Google is only meaningful if it was minted *for this
 * app*: the signature proves the provider issued it, and the audience proves
 * it was issued to us rather than to some other app the user also signed into.
 * Skip the audience check and any app's token opens any account here.
 *
 * These are public identifiers, not secrets, which is why they are literals
 * rather than `secret()` values — Cognito needs them at bundle time, and they
 * already appear in the client bundle and in Apple's and Google's consoles.
 */

/**
 * Apple's native flow issues tokens addressed to the *bundle ID*, not to the
 * Services ID configured for the hosted UI. The two are easy to confuse: the
 * Services ID (`APPLE_SERVICE_ID`) is what Cognito's web redirect uses, and a
 * token signed for it will never arrive here.
 *
 * Keep in sync with `expo.ios.bundleIdentifier` in app.json.
 */
export const APPLE_AUDIENCES = ["com.xlaris.app.template.aws"];

/**
 * Google issues iOS tokens addressed to the iOS client ID, and Android tokens
 * addressed to the *web* client ID (Android passes it as `serverClientId`).
 * Both are listed for that reason; a missing entry breaks one platform only,
 * which is a confusing way to find out.
 *
 * Keep in sync with `GoogleSignin.configure` in app/(onboarding)/auth-form.tsx.
 */
export const GOOGLE_AUDIENCES = [
  "187798873933-o6elcb0ebdfpc27lurlvgjuniic0bdb6.apps.googleusercontent.com",
  "187798873933-ujuitpbpg7e46dskojpead8cvk7b7rs1.apps.googleusercontent.com",
];

/**
 * How old a provider token may be and still be spent here.
 *
 * `exp` alone is not enough: Google's ID tokens live an hour, which is an hour
 * in which a token captured off a device can be replayed. The sign-in it is
 * being spent on happens seconds after the sheet closes, so anything much
 * older than that did not come from the flow it claims to. Replay *inside*
 * this window is what the used-token store closes; see ./used-tokens.ts.
 */
export const NATIVE_TOKEN_MAX_AGE_SECONDS = 600;

/** Tolerance for a device or Lambda clock that disagrees with the provider. */
export const CLOCK_SKEW_SECONDS = 60;

/**
 * The provider identities an account may be signed into with, as
 * `provider|subject` pairs separated by spaces — `apple|000123.abc`,
 * `google|110022334455`.
 *
 * The `sub` is the identifier that matters. An email address is not a stable
 * identity: Google says so outright, people change theirs, and an abandoned
 * address on a managed domain can be reassigned to a different person, who
 * would otherwise inherit the account. Email is used once, to find the account
 * a new identity should attach to; from then on the pair below is what opens
 * it.
 *
 * A list, because one person legitimately arrives through both providers. What
 * is *not* allowed is a second subject for a provider the account already has:
 * that is what a reassigned address looks like.
 */
export const PROVIDER_IDS_ATTRIBUTE = "custom:provider_ids";

/** Names the one custom challenge this pool defines, for the client to match. */
export const NATIVE_TOKEN_CHALLENGE = "PROVIDER_ID_TOKEN";
