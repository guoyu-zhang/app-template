import type { StorageAdapter } from "../types";

import { supabase } from "./client";

export const storage: StorageAdapter = {
  async upload({ bucket, path, uri, contentType }) {
    try {
      const response = await fetch(uri);
      const body = await response.arrayBuffer();

      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(path, body, {
          contentType: contentType ?? "application/octet-stream",
          upsert: true,
        });

      if (error) return { path: null, error };
      return { path: data.path, error: null };
    } catch (error) {
      return { path: null, error: error as Error };
    }
  },

  async getUrl({ bucket, path }) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { url: data.publicUrl ?? null, error: null };
  },

  async remove({ bucket, paths }) {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    return { error };
  },
};
