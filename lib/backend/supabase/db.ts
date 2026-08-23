import type { DbAdapter } from "../types";

import { supabase } from "./client";

export const db: DbAdapter = {
  async submitContactMessage({ userId, category, message }) {
    const { error } = await supabase.from("contact_messages").insert([
      {
        user_id: userId,
        category,
        message,
      },
    ]);
    return { error };
  },
};
