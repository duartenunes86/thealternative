import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import type { App } from 'firebase-admin/app';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';

/**
 * Server-side Firebase, used only by API routes. Credentials come from
 * FIREBASE_SERVICE_ACCOUNT — the whole service account JSON as one env var.
 *
 * This replaces what would otherwise be Cloud Functions, so the app does not
 * need a Firebase Blaze plan (and therefore no billing account) to send push
 * notifications or email digests.
 */
export function isAdminConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
}

function getAdminApp(): App {
  const existing = getApps();
  if (existing.length) return existing[0];

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!raw)
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT is not set — server-side Firebase is unavailable'
    );

  // the key is stored as JSON; newlines in the private key survive as \n
  const parsed = JSON.parse(raw) as {
    project_id: string;
    client_email: string;
    private_key: string;
  };

  return initializeApp({
    credential: cert({
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key.replace(/\\n/g, '\n')
    })
  });
}

export function adminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function adminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function adminMessaging(): Messaging {
  return getMessaging(getAdminApp());
}
