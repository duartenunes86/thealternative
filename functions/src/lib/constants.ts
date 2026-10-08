/**
 * Public site URL used in emails and push notification links.
 * The custom domain is served by Render and its DNS lives at Cloudflare.
 */
export const SITE_URL = 'https://thealternative.social';

/** Region the functions in this project are deployed to (see lib/utils.ts). */
export const FUNCTIONS_REGION = 'asia-southeast2';

export const FUNCTIONS_BASE_URL = `https://${FUNCTIONS_REGION}-thealternative-ed758.cloudfunctions.net`;
