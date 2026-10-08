import { timingSafeEqual } from 'crypto';
import { firestore, functions, regionalFunctions } from './lib/utils';
import { createUnsubscribeToken } from './email-digest';
import { SITE_URL } from './lib/constants';

function page(title: string, message: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:48px 16px;background:#f5f8fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:440px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;text-align:center">
    <h1 style="margin:0 0 8px;font-size:20px;color:#14171a">${title}</h1>
    <p style="margin:0 0 20px;color:#687684;line-height:1.5">${message}</p>
    <a href="${SITE_URL}" style="display:inline-block;background:#1da1f2;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-weight:600">Go to The Alternative</a>
  </div>
</body></html>`;
}

function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) return false;

  return timingSafeEqual(left, right);
}

export const unsubscribeDigest = regionalFunctions.https.onRequest(
  async (request, response): Promise<void> => {
    const uid = String(request.query.uid ?? '');
    const token = String(request.query.token ?? '');

    if (!uid || !token) {
      response.status(400).send(page('Invalid link', 'This unsubscribe link is missing information.'));
      return;
    }

    if (!tokensMatch(token, createUnsubscribeToken(uid))) {
      response.status(403).send(page('Invalid link', 'This unsubscribe link is not valid or has expired.'));
      return;
    }

    try {
      await firestore().doc(`users/${uid}`).update({ emailDigest: 'off' });
    } catch (error) {
      functions.logger.error(`Unsubscribe failed for ${uid}`, error);
      response.status(500).send(page('Something went wrong', 'We could not update your preferences. Please try again later.'));
      return;
    }

    functions.logger.info(`User ${uid} unsubscribed from the email digest.`);

    // One-click unsubscribe (RFC 8058) POSTs rather than GETs
    if (request.method === 'POST') {
      response.status(200).send('OK');
      return;
    }

    response
      .status(200)
      .send(
        page(
          'You’re unsubscribed',
          'You will no longer receive round-up emails. You can turn them back on any time from your notifications page.'
        )
      );
  }
);
