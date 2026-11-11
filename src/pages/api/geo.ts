import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb, isAdminConfigured } from '@lib/firebase/admin';
import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Records which country a user first signed in from, so email rules can
 * differ by country (e.g. UK/EU need opt-in for the round-up digest).
 *
 * Only the two-letter country code is stored, never the IP. It lives in
 * userGeo/{uid}, which has no Firestore rule, so only the server can read it.
 * Written once: later calls see the doc exists and stop.
 *
 * The client IP comes from X-TA-Client-IP, which the nginx in front of the
 * app sets to $remote_addr (Traefik in between rewrites X-Forwarded-For).
 */

function clientIp(req: NextApiRequest): string | null {
  const header = req.headers['x-ta-client-ip'];
  const ip = (Array.isArray(header) ? header[0] : header)?.trim();
  return ip ? ip : null;
}

async function lookupCountry(ip: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(
      `https://api.country.is/${encodeURIComponent(ip)}`,
      {
        signal: controller.signal
      }
    );
    if (!res.ok) return null;
    const { country } = (await res.json()) as { country?: string };
    return country && /^[A-Z]{2}$/.test(country) ? country : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!isAdminConfigured()) {
    res.status(200).json({ saved: false, reason: 'admin-not-configured' });
    return;
  }

  const { idToken } = (req.body ?? {}) as { idToken?: string };

  if (!idToken) {
    res.status(400).json({ error: 'Missing idToken' });
    return;
  }

  let uid: string;

  try {
    ({ uid } = await adminAuth().verifyIdToken(idToken));
  } catch {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  const ref = adminDb().doc(`userGeo/${uid}`);

  if ((await ref.get()).exists) {
    res.status(200).json({ saved: false, reason: 'already-recorded' });
    return;
  }

  const ip = clientIp(req);
  const country = ip ? await lookupCountry(ip) : null;

  if (!country) {
    // try again on a later sign-in rather than storing an unknown
    res.status(200).json({ saved: false, reason: 'country-unknown' });
    return;
  }

  await ref.set({ country, recordedAt: FieldValue.serverTimestamp() });

  res.status(200).json({ saved: true, country });
}
