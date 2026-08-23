import { fetchAuthSession } from "aws-amplify/auth";
import { getUrl, remove, uploadData } from "aws-amplify/storage";

import type { StorageAdapter } from "../types";

import "./client";

/**
 * S3 has no container inside a bucket, so the contract's `bucket` becomes one
 * segment of the key. All three methods build the key through this function,
 * which is what makes an uploaded path resolvable and removable later.
 *
 * The identity segment is required by the access rules in
 * amplify/storage/resource.ts: only the owning identity may write or delete.
 */
async function keyFor(bucket: string, path: string): Promise<string> {
  const { identityId } = await fetchAuthSession();
  if (!identityId) {
    throw new Error("Storage requires a signed-in user.");
  }
  return `media/${identityId}/${bucket}/${path}`;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export const storage: StorageAdapter = {
  /**
   * Amplify's `uploadData` wants bytes, and expo's file URIs are not bytes,
   * so the file goes through fetch first — the same round trip the Supabase
   * branch makes for the same reason.
   */
  async upload({ bucket, path, uri, contentType }) {
    try {
      const key = await keyFor(bucket, path);
      const response = await fetch(uri);
      const data = await response.blob();

      const result = await uploadData({
        path: key,
        data,
        options: {
          contentType: contentType ?? "application/octet-stream",
        },
      }).result;

      return { path: result.path, error: null };
    } catch (error) {
      return { path: null, error: asError(error) };
    }
  },

  /**
   * Unlike Supabase's `getPublicUrl`, this is presigned and expires — an hour
   * here, which is Amplify's cap for credentials-based signing. Callers must
   * resolve at render time and must not persist the result.
   */
  async getUrl({ bucket, path }) {
    try {
      const key = await keyFor(bucket, path);
      const { url } = await getUrl({
        path: key,
        options: { expiresIn: 3600 },
      });
      return { url: url.toString(), error: null };
    } catch (error) {
      return { url: null, error: asError(error) };
    }
  },

  /**
   * S3 deletes one key per call; the loop stops at the first failure so the
   * caller sees the real error rather than the last one.
   */
  async remove({ bucket, paths }) {
    try {
      for (const path of paths) {
        await remove({ path: await keyFor(bucket, path) });
      }
      return { error: null };
    } catch (error) {
      return { error: asError(error) };
    }
  },
};
