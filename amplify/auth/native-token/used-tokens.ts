import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

import { CLOCK_SKEW_SECONDS } from "./config";

/**
 * One provider token, one sign-in.
 *
 * Everything else about a token can be checked from the token: its signature,
 * who issued it, who it was for, how old it is. What cannot is whether it has
 * already been spent — and a token lifted off a device is a working credential
 * until it expires, which for Google is an hour.
 *
 * So the first sign-in to present a token records it, and the next one to
 * present the same token is refused. The record expires with the token; DynamoDB's
 * TTL sweeps it, and the conditional write is what makes the check atomic
 * rather than a read-then-write two sign-ins can both win.
 */

const client = new DynamoDBClient({});

const TABLE_NAME = process.env.USED_TOKENS_TABLE;

export class TokenAlreadyUsedError extends Error {
  constructor() {
    super("Provider token has already been used.");
    this.name = "TokenAlreadyUsedError";
  }
}

/**
 * Claims a token, or throws if something already has.
 *
 * A missing table name throws rather than waving the token through: this
 * function existing at all is the replay defence, and a misconfigured
 * deployment silently losing it is the failure worth being loud about.
 */
export async function claimToken(params: {
  tokenHash: string;
  expiresAt: number;
}): Promise<void> {
  if (!TABLE_NAME) {
    throw new Error("USED_TOKENS_TABLE is not configured.");
  }

  try {
    await client.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: {
          tokenHash: { S: params.tokenHash },
          // Kept a little past the token's own expiry so the row outlives every
          // clock this check tolerates.
          expiresAt: {
            N: String(params.expiresAt + CLOCK_SKEW_SECONDS),
          },
        },
        ConditionExpression: "attribute_not_exists(tokenHash)",
      }),
    );
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      throw new TokenAlreadyUsedError();
    }
    throw error;
  }
}
