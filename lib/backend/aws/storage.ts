import type { StorageAdapter } from "../types";

import { notImplemented } from "./not-implemented";

/**
 * S3 via "aws-amplify/storage": uploadData, getUrl, remove.
 *
 * Note the semantic difference from Supabase's `getPublicUrl`: `getUrl`
 * returns a presigned URL that expires, so callers cannot cache the result
 * indefinitely.
 */
export const storage: StorageAdapter = {
  async upload() {
    return notImplemented("storage.upload");
  },

  async getUrl() {
    return notImplemented("storage.getUrl");
  },

  async remove() {
    return notImplemented("storage.remove");
  },
};
