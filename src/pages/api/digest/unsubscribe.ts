import { createHmac, timingSafeEqual } from 'crypto';
import { adminDb, isAdminConfigured } from '@lib/firebase/admin';
import type { NextApiRequest, NextApiResponse } from 'next';

const siteURL = process.env.NEXT_PUBLIC_URL ?? 'https://thealternative.social';

function page(title: string, message: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:48px 16px;background:#f5f8fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:440px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;text-align:center">
    <h1 style="margin:0 0 8px;font-size:20px;color:#14171a">${title}</h1>
    <p style="margin:0 0 20px;color:#687684;line-height:1.5">${message}</p>
    <a href="${siteURL}" style="display:inline-block;background:#1da1f2;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-weight:600">Go to The Alternative</a>
  </div>
</body></html>`;
}

function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  const uid = String(req.query.uid ?? '');
  const token = String(req.query.token ?? '');
  const secret = process.env.DIGEST_SECRET;

  res.setHeader('content-type', 'text/html; charset=utf-8');

  if (!uid || !token || !secret || !isAdminConfigured()) {
    res
      .status(400)
      .send(page('Invalid link', 'This unsubscribe link is missing information.'));
    return;
  }

  const expected = createHmac('sha256', secret)
    .update(uid)
    .digest('hex')
    .slice(0, 32);

  if (!tokensMatch(token, expected)) {
    res
      .status(403)
      .send(page('Invalid link', 'This unsubscribe link is not valid.'));
    return;
  }

  try {
    await adminDb().doc(`users/${uid}`).update({ emailDigest: 'off' });
  } catch {
    res
      .status(500)
      .send(
        page(
          'Something went wrong',
          'We could not update your preferences. Please try again later.'
        )
      );
    return;
  }

  // One-click unsubscribe (RFC 8058) POSTs rather than GETs
  if (req.method === 'POST') {
    res.setHeader('content-type', 'text/plain');
    res.status(200).send('OK');
    return;
  }

  res
    .status(200)
    .send(
      page(
        'You’re unsubscribed',
        'You will no longer receive round-up emails. You can turn them back on any time from your notifications page.'
      )
    );
}
