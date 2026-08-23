import { a, defineData, type ClientSchema } from "@aws-amplify/backend";

/**
 * AppSync + DynamoDB. `allow.owner()` is the RLS equivalent: AppSync stamps
 * an implicit `owner` field from the caller's Cognito sub and filters every
 * read and write by it, so the client never sends a user id and cannot forge
 * one. That is why `DbAdapter.submitContactMessage` takes a `userId` it does
 * not use — the Supabase branch needs it for the insert, this one does not.
 *
 * The deletion of a user's rows is client-side, in `auth.deleteAccount`:
 * owner authorization means the leaving user is the only party who can read
 * their own rows, so a Lambda would need an admin-scoped override to do the
 * same work.
 */
const schema = a.schema({
  ContactMessage: a
    .model({
      category: a.string().required(),
      message: a.string().required(),
    })
    .authorization((allow) => [allow.owner()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
