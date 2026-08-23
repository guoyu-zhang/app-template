/**
 * Fails loudly and specifically while the AWS adapter is being built, so a
 * missing method shows up as "not implemented yet" rather than as a confusing
 * null session or silent no-op.
 */
export function notImplemented(method: string): never {
  throw new Error(
    `[backend/aws] ${method} is not implemented yet. See lib/backend/aws/README.md.`,
  );
}
