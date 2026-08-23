import type { DbAdapter } from "../types";

import { notImplemented } from "./not-implemented";

/**
 * AppSync + DynamoDB. Each operation becomes a typed model call:
 *   const client = generateClient<Schema>();
 *   await client.models.ContactMessage.create({ ... });
 *
 * Authorization moves from RLS policies into the schema's `allow.owner()`
 * rules, so `userId` is set by AppSync rather than passed by the client.
 */
export const db: DbAdapter = {
  async submitContactMessage() {
    return notImplemented("db.submitContactMessage");
  },
};
