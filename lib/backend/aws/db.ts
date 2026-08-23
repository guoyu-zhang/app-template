import type { DbAdapter } from "../types";

import { dataClient } from "./client";

/**
 * AppSync + DynamoDB, through the typed model client generated from
 * amplify/data/resource.ts.
 */
export const db: DbAdapter = {
  /**
   * `userId` is deliberately unused: the schema's `allow.owner()` makes
   * AppSync stamp the owner from the caller's Cognito sub, so sending one
   * would be both redundant and unenforceable. The parameter stays because
   * the Supabase branch needs it for its insert.
   */
  async submitContactMessage({ category, message }) {
    try {
      const { errors } = await dataClient.models.ContactMessage.create({
        category,
        message,
      });
      if (errors?.length) {
        return { error: new Error(errors.map((e) => e.message).join("; ")) };
      }
      return { error: null };
    } catch (error) {
      return {
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },
};

/**
 * Deletes every row the signed-in user owns, so `auth.deleteAccount` can run
 * before the Cognito identity disappears. Owner authorization already scopes
 * the list to the caller — there is no filter to write, and no way to reach
 * anyone else's rows from here.
 *
 * Returns the error rather than throwing, to match how the adapters report.
 * A fork that adds owned models must add them to this function too; nothing
 * enforces that, and orphaned rows are invisible once the owner is gone.
 */
export async function purgeOwnedRows(): Promise<Error | null> {
  try {
    const { data, errors } = await dataClient.models.ContactMessage.list({
      selectionSet: ["id"],
    });
    if (errors?.length) {
      return new Error(errors.map((e) => e.message).join("; "));
    }

    for (const row of data ?? []) {
      const { errors: deleteErrors } =
        await dataClient.models.ContactMessage.delete({ id: row.id });
      if (deleteErrors?.length) {
        return new Error(deleteErrors.map((e) => e.message).join("; "));
      }
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}
