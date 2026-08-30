import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { APPLE_AUDIENCES, GOOGLE_AUDIENCES } from "./config";
import { withIdentity } from "./identity";
import { verifyProviderToken } from "./verify-token";

/**
 * The verifier is the whole security boundary of native sign-in, so the cases
 * that matter are the refusals: a token for another app, a token past its
 * hour, a token whose payload has been edited, a header that names an
 * algorithm the attacker controls the key for.
 *
 * Run with `npm run test:auth`.
 */

const KEY_ID = "test-key";
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const jwk = { ...publicKey.export({ format: "jwk" }), kid: KEY_ID, alg: "RS256" };

function encode(value: object | string): string {
  const json = typeof value === "string" ? value : JSON.stringify(value);
  return Buffer.from(json).toString("base64url");
}

function sign(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "RS256", kid: KEY_ID },
): string {
  const body = `${encode(header)}.${encode(payload)}`;
  const signature = createSign("RSA-SHA256").update(body).sign(privateKey);
  return `${body}.${signature.toString("base64url")}`;
}

function applePayload(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: "https://appleid.apple.com",
    aud: APPLE_AUDIENCES[0],
    sub: "000123.abcdef",
    email: "Learner@Example.com",
    email_verified: "true",
    iat: now,
    exp: now + 600,
    ...overrides,
  };
}

const originalFetch = globalThis.fetch;

before(() => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
});

after(() => {
  globalThis.fetch = originalFetch;
});

async function rejects(token: string, provider: "apple" | "google" = "apple") {
  await assert.rejects(() => verifyProviderToken(provider, token));
}

describe("verifyProviderToken", () => {
  it("accepts a well-formed token and normalises the identity", async () => {
    const identity = await verifyProviderToken("apple", sign(applePayload()));
    assert.equal(identity.identity, "apple|000123.abcdef");
    assert.equal(identity.email, "learner@example.com");
    assert.equal(identity.subject, "000123.abcdef");
  });

  it("accepts a Google token on either issuer spelling", async () => {
    for (const iss of ["accounts.google.com", "https://accounts.google.com"]) {
      const token = sign(
        applePayload({
          iss,
          aud: GOOGLE_AUDIENCES[0],
          sub: "110022334455",
          email_verified: true,
        }),
      );
      const identity = await verifyProviderToken("google", token);
      assert.equal(identity.identity, "google|110022334455");
    }
  });

  it("refuses a token minted for another app", async () => {
    await rejects(sign(applePayload({ aud: "com.someone.else" })));
  });

  it("refuses a token from another issuer", async () => {
    await rejects(sign(applePayload({ iss: "https://evil.example" })));
  });

  it("refuses an expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    await rejects(sign(applePayload({ exp: now - 3600, iat: now - 7200 })));
  });

  it("refuses a token older than the sign-in it claims to be from", async () => {
    const now = Math.floor(Date.now() / 1000);
    await rejects(sign(applePayload({ iat: now - 3600, exp: now + 600 })));
  });

  it("refuses an unverified email", async () => {
    await rejects(sign(applePayload({ email_verified: "false" })));
  });

  it("refuses a token with no email at all", async () => {
    const payload = applePayload();
    delete (payload as { email?: unknown }).email;
    await rejects(sign(payload));
  });

  it("refuses an edited payload", async () => {
    const token = sign(applePayload());
    const [header, , signature] = token.split(".");
    const forged = encode(applePayload({ sub: "999999.attacker" }));
    await rejects(`${header}.${forged}.${signature}`);
  });

  it("refuses an algorithm the caller chose", async () => {
    for (const alg of ["none", "HS256", "RS512"]) {
      await rejects(sign(applePayload(), { alg, kid: KEY_ID }));
    }
  });

  it("refuses a signature from an unpublished key", async () => {
    await rejects(sign(applePayload(), { alg: "RS256", kid: "not-published" }));
  });

  it("refuses a token whose nonce is not the one presented", async () => {
    const token = sign(applePayload({ nonce: "abc123" }));
    await assert.rejects(() => verifyProviderToken("apple", token, "def456"));
    await assert.rejects(() => verifyProviderToken("apple", token));
    const identity = await verifyProviderToken("apple", token, "abc123");
    assert.equal(identity.subject, "000123.abcdef");
  });

  it("refuses anything that is not a JWT", async () => {
    for (const junk of ["", "not-a-token", "a.b", "a.b.c"]) {
      await rejects(junk);
    }
  });
});

describe("withIdentity", () => {
  it("adds a first identity", () => {
    assert.deepEqual(withIdentity([], "apple|1"), {
      identities: ["apple|1"],
      changed: true,
    });
  });

  it("is a no-op for one already listed", () => {
    assert.deepEqual(withIdentity(["apple|1"], "apple|1"), {
      identities: ["apple|1"],
      changed: false,
    });
  });

  it("lets one person arrive through both providers", () => {
    assert.deepEqual(withIdentity(["apple|1"], "google|2"), {
      identities: ["apple|1", "google|2"],
      changed: true,
    });
  });

  it("refuses a second subject for a provider already linked", () => {
    // What a reassigned email address looks like from the backend.
    assert.throws(() => withIdentity(["google|2"], "google|3"));
  });
});
