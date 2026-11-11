import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb, isAdminConfigured } from '@lib/firebase/admin';
import { postalAddress } from '@lib/server/mail';
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

/**
 * Countries whose law lets a service email its own users a round-up by
 * default, with an unsubscribe link (opt-out) rather than asking first:
 *   US — CAN-SPAM (needs unsubscribe link + postal address in every email)
 *   HK — Unsolicited Electronic Messages Ordinance (unsubscribe facility)
 * Everywhere else (UK, EU, Canada, Australia, Japan, Korea, ...) needs a
 * clear yes, so those users keep the home-page prompt.
 *
 * Caveat: the sender is UK-established, and it is arguable that UK PECR
 * covers its marketing to any recipient. Empty this list to go back to
 * opt-in everywhere.
 */
const OPT_OUT_COUNTRIES = new Set(['US', 'HK']);

const DEFAULT_OPT_OUT_FREQUENCY = 'weekly';

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

  // US law needs a postal address in each email, so only default people in
  // when the footer will carry one
  let digestDefaulted = false;

  if (OPT_OUT_COUNTRIES.has(country) && postalAddress) {
    const userRef = adminDb().doc(`users/${uid}`);
    const userSnap = await userRef.get();

    // only people who have never chosen; an explicit 'off' is respected
    if (userSnap.exists && userSnap.get('emailDigest') === undefined) {
      await userRef.update({ emailDigest: DEFAULT_OPT_OUT_FREQUENCY });
      digestDefaulted = true;
    }
  }

  res.status(200).json({ saved: true, country, digestDefaulted });
}
