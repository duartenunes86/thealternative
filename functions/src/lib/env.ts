import { defineString } from 'firebase-functions/params';

const EMAIL_API = defineString('EMAIL_API');
const EMAIL_API_PASSWORD = defineString('EMAIL_API_PASSWORD');
const TARGET_EMAIL = defineString('TARGET_EMAIL');

/** Signs one-click unsubscribe links so they work without logging in. */
const DIGEST_SECRET = defineString('DIGEST_SECRET');

export { EMAIL_API, EMAIL_API_PASSWORD, TARGET_EMAIL, DIGEST_SECRET };
