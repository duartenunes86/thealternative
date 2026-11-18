import type { Auth, UserRecord } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

/**
 * The address to send a user's emails to.
 *
 * `UserRecord.email` is empty for some accounts even though the user signed in
 * with an email-bearing provider (Google sign-in with "one account per
 * provider", or accounts linked after creation). In that case the address
 * still lives on the provider entry, so fall back to the first provider that
 * has one, then to the address the user saved in
 * `users/{uid}/private/contact` (owner-only, not the public profile doc).
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

/**
 * Look up where to email a user. Returns undefined when the account was
 * deleted from Auth or no address is known anywhere.
 */
export async function emailForUser(
  auth: Auth,
  db: Firestore,
  uid: string
): Promise<string | undefined> {
  let record: UserRecord;
  try {
    record = await auth.getUser(uid);
  } catch {
    return undefined; // deleted from Auth but left in Firestore
  }

  const direct = resolveUserEmail(record);
  if (direct) return direct;

  const contact = await db.doc(`users/${uid}/private/contact`).get();
  return resolveUserEmail(record, contact.get('email'));
}
