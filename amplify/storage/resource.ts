import { defineStorage } from "@aws-amplify/backend";

/**
 * One S3 bucket. The `StorageAdapter` contract is shaped around Supabase,
 * where `bucket` is a real top-level container; S3 has nothing like it, so
 * the adapter flattens `{ bucket, path }` onto the key
 *
 *     media/<identityId>/<bucket>/<path>
 *
 * and computes it identically in upload, getUrl and remove so the three round
 * trip. `<bucket>` is therefore a naming convention, not a security boundary
 * — the rules below are what actually divide access, and they divide it by
 * identity, not by bucket.
 *
 * Any signed-in user may read; only the owning identity may write or delete.
 * A fork that needs a genuinely public prefix, or per-bucket rules, should
 * add explicit entries here rather than widening these two.
 */
export const storage = defineStorage({
  name: "appTemplateMedia",
  access: (allow) => ({
    // Both rules on one path, not two paths. Amplify rejects a path that is a
    // prefix of another containing {entity_id} — `media/*` alongside
    // `media/{entity_id}/*` fails synth with InvalidStorageAccessPathError,
    // because the two would disagree about who owns a key matching both.
    "media/{entity_id}/*": [
      allow.entity("identity").to(["read", "write", "delete"]),
      allow.authenticated.to(["read"]),
    ],
  }),
});
