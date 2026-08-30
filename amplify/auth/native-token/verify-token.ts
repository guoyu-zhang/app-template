import { createHash, createPublicKey, createVerify } from "node:crypto";

import {
  APPLE_AUDIENCES,
  CLOCK_SKEW_SECONDS,
  GOOGLE_AUDIENCES,
  NATIVE_TOKEN_MAX_AGE_SECONDS,
} from "./config";

/**
 * Verification of the ID tokens Apple and Google hand to the device.
 *
 * This is the whole security boundary of native sign-in. Cognito has no API
 * that accepts a provider token, so the app gets one natively and this code
 * decides whether it is real; everything downstream trusts the answer. A
 * hosted-provider service (Supabase, Firebase) does exactly this work behind
 * one SDK call — the checks below are that call, written out.
 *
 * No JWT library: the algorithm is fixed at RS256 and Node can verify RSA
 * signatures and parse JWKs on its own. A dependency here would be a
 * dependency inside an auth trigger, updated by nobody, for about sixty lines.
 */

export type NativeProvider = "apple" | "google";

export type VerifiedIdentity = {
  provider: NativeProvider;
  /** The provider's stable user id (`sub`). Never reused across accounts. */
  subject: string;
  /** `provider|subject` — what an account stores and is opened by. */
  identity: string;
  /** Always lowercased. Used to *find* an account, never to authorise one. */
  email: string;
  /** Hash of the raw token, for the replay store. */
  tokenHash: string;
  /** When the token stops being spendable, for that store's TTL. */
  expiresAt: number;
};

export function identityOf(provider: NativeProvider, subject: string): string {
  return `${provider}|${subject}`;
}

type ProviderSpec = {
  /**
   * Google is the reason this is a list: it has issued tokens under both
   * `accounts.google.com` and `https://accounts.google.com` for years, and
   * both are current.
   */
  issuers: string[];
  jwksUri: string;
  audiences: string[];
};

const PROVIDERS: Record<NativeProvider, ProviderSpec> = {
  apple: {
    issuers: ["https://appleid.apple.com"],
    jwksUri: "https://appleid.apple.com/auth/keys",
    audiences: APPLE_AUDIENCES,
  },
  google: {
    issuers: ["accounts.google.com", "https://accounts.google.com"],
    jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
    audiences: GOOGLE_AUDIENCES,
  },
};

type Jwk = { kid?: string; kty?: string; n?: string; e?: string };

/**
 * Signing keys, cached for the life of the execution environment. Both
 * providers rotate keys on the order of weeks and publish the new one before
 * using it, so a warm Lambda that has already fetched the set almost always
 * has the key it needs.
 *
 * The refetch floor matters more than the cache: an unknown `kid` is what a
 * forged token looks like, and without a floor a stream of them turns this
 * function into a request amplifier pointed at Apple.
 */
const JWKS_MIN_REFETCH_MS = 60_000;
/**
 * And an upper bound, so a key that has been withdrawn stops being trusted.
 * A warm Lambda can live for hours; without this, a key revoked by Apple after
 * a compromise would keep verifying signatures here until the environment
 * happened to recycle.
 */
const JWKS_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const jwksCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();

async function signingKey(spec: ProviderSpec, kid: string): Promise<Jwk> {
  const cached = jwksCache.get(spec.jwksUri);
  const fresh = cached && Date.now() - cached.fetchedAt < JWKS_MAX_AGE_MS;
  const cachedKey = fresh
    ? cached.keys.find((key) => key.kid === kid)
    : undefined;
  if (cachedKey) return cachedKey;
  if (fresh && Date.now() - cached.fetchedAt < JWKS_MIN_REFETCH_MS) {
    throw new Error("Token was signed with an unknown key.");
  }

  const response = await fetch(spec.jwksUri);
  if (!response.ok) {
    throw new Error(
      `Could not read signing keys from ${spec.jwksUri} (${response.status}).`,
    );
  }
  const body = (await response.json()) as { keys?: Jwk[] };
  const keys = body.keys ?? [];
  jwksCache.set(spec.jwksUri, { keys, fetchedAt: Date.now() });

  const key = keys.find((candidate) => candidate.kid === kid);
  if (!key) throw new Error("Token was signed with an unknown key.");
  return key;
}

function decodeSegment(segment: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    // Whatever arrived is not base64url-encoded JSON. Say that, rather than
    // letting a parser's complaint about a stray byte become the message the
    // sign-in screen shows.
    throw new Error("Token is not a JWT.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Token segment is not an object.");
  }
  return parsed as Record<string, unknown>;
}

/** Apple sends `email_verified` as the string "true"; Google as a boolean. */
function isTrue(value: unknown): boolean {
  return value === true || value === "true";
}

function audienceMatches(claim: unknown, audiences: string[]): boolean {
  const values = Array.isArray(claim) ? claim : [claim];
  return values.some(
    (value) => typeof value === "string" && audiences.includes(value),
  );
}

export function isNativeProvider(value: unknown): value is NativeProvider {
  return value === "apple" || value === "google";
}

/**
 * Verifies a provider ID token and returns who it says the user is.
 *
 * Throws on anything unexpected rather than returning a flag: every caller
 * treats failure the same way, and a thrown message is what ends up in the
 * Lambda log when a sign-in stops working.
 */
export async function verifyProviderToken(
  provider: NativeProvider,
  token: string,
  /**
   * The nonce the client asked the provider to stamp into the token, when the
   * platform supports one. Apple does; the Google Sign-In API this app uses
   * does not, so its tokens carry no `nonce` claim and none is expected.
   *
   * A token that *does* carry one must be presented with it, so stripping the
   * nonce is not a way around the check.
   */
  nonce?: string,
): Promise<VerifiedIdentity> {
  const spec = PROVIDERS[provider];
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Token is not a JWT.");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  const header = decodeSegment(encodedHeader);
  /**
   * Pinning the algorithm is not a formality. Accepting whatever `alg` the
   * token names is the original JWT vulnerability: `none` skips verification,
   * and `HS256` invites the verifier to use the provider's *public* key as an
   * HMAC secret — a key the attacker also has.
   */
  if (header.alg !== "RS256") {
    throw new Error(`Unexpected token algorithm: ${String(header.alg)}.`);
  }
  if (typeof header.kid !== "string") {
    throw new Error("Token header has no key id.");
  }

  const jwk = await signingKey(spec, header.kid);
  const publicKey = createPublicKey({ key: jwk as JsonWebKey, format: "jwk" });
  const signed = createVerify("RSA-SHA256")
    .update(`${encodedHeader}.${encodedPayload}`)
    .verify(publicKey, Buffer.from(encodedSignature, "base64url"));
  if (!signed) throw new Error("Token signature does not verify.");

  const payload = decodeSegment(encodedPayload);
  const now = Math.floor(Date.now() / 1000);

  if (typeof payload.iss !== "string" || !spec.issuers.includes(payload.iss)) {
    throw new Error(`Unexpected token issuer: ${String(payload.iss)}.`);
  }
  if (!audienceMatches(payload.aud, spec.audiences)) {
    throw new Error(
      `Token was issued for another app: ${JSON.stringify(payload.aud)}.`,
    );
  }
  if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_SECONDS < now) {
    throw new Error("Token has expired.");
  }
  if (
    typeof payload.iat !== "number" ||
    payload.iat < now - NATIVE_TOKEN_MAX_AGE_SECONDS - CLOCK_SKEW_SECONDS
  ) {
    throw new Error("Token is too old to be from this sign-in.");
  }
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("Token has no subject.");
  }

  /**
   * The email is what ties the token to an account here, so an unverified one
   * is worse than none: it would let anyone who can type an address into a
   * provider account claim the account that belongs to it. Apple always
   * verifies (including its private-relay addresses), and Google marks the
   * rare unverified case.
   */
  if (typeof payload.email !== "string" || !payload.email) {
    throw new Error("Token carries no email address.");
  }
  if (!isTrue(payload.email_verified)) {
    throw new Error("Provider has not verified this email address.");
  }

  if (payload.nonce !== undefined && payload.nonce !== nonce) {
    throw new Error("Token was minted for a different sign-in attempt.");
  }

  return {
    provider,
    subject: payload.sub,
    identity: identityOf(provider, payload.sub),
    email: payload.email.toLowerCase(),
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: payload.exp,
  };
}
