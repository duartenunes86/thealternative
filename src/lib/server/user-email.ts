import type { UserRecord } from 'firebase-admin/auth';

/**
 * The address to send a user's emails to.
 *
 * `UserRecord.email` is empty for some accounts even though the user signed in
 * with an email-bearing provider (Google sign-in with "one account per
 * provider", or accounts linked after creation). In that case the address
 * still lives on the provider entry, so fall back to the first provider that
 * has one, then to an `email` field on the Firestore user doc.
 */
export function resolveUserEmail(
  record: Pick<UserRecord, 'email' | 'providerData'> | null | undefined,
  firestoreEmail?: unknown
): string | undefined {
  const fromRecord = record?.email?.trim();
  if (fromRecord) return fromRecord;

  const fromProvider = record?.providerData
    ?.map((p) => p?.email?.trim())
    .find((e): e is string => Boolean(e));
  if (fromProvider) return fromProvider;

  if (typeof firestoreEmail === 'string' && firestoreEmail.includes('@'))
    return firestoreEmail.trim();

  return undefined;
}
