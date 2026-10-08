import { defineString } from 'firebase-functions/params';

/**
 * These default to empty so a missing value never blocks a deploy — the
 * functions that need them check `isEmailConfigured()` and skip instead.
 */
const EMAIL_API = defineString('EMAIL_API', { default: '' });
const EMAIL_API_PASSWORD = defineString('EMAIL_API_PASSWORD', { default: '' });
const TARGET_EMAIL = defineString('TARGET_EMAIL', { default: '' });

/** Signs one-click unsubscribe links so they work without logging in. */
const DIGEST_SECRET = defineString('DIGEST_SECRET', { default: '' });

export function isEmailConfigured(): boolean {
  return Boolean(EMAIL_API.value() && EMAIL_API_PASSWORD.value());
}

export { EMAIL_API, EMAIL_API_PASSWORD, TARGET_EMAIL, DIGEST_SECRET };
