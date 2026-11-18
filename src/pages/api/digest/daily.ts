import { adminDb, isAdminConfigured } from '@lib/firebase/admin';
import { dailyTokenIsValid, escapeHtml, siteURL } from '@lib/server/mail';
import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * "Get this daily" link from the weekly round-up.
 * GET only shows a confirm button: mail scanners (Gmail, Outlook Safe Links)
 * open links in emails, and that must not change anyone's settings.
 * The button POSTs back here, which does the switch.
 */
function page(title: string, message: string, form = ''): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:48px 16px;background:#f5f8fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:440px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;text-align:center">
    <h1 style="margin:0 0 8px;font-size:20px;color:#14171a">${title}</h1>
    <p style="margin:0 0 20px;color:#687684;line-height:1.5">${message}</p>
    ${form || `<a href="${siteURL}" style="display:inline-block;background:#1da1f2;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-weight:600">Go to The Alternative</a>`}
  </div>
</body></html>`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  const uid = String(req.query.uid ?? '');
  const token = String(req.query.token ?? '');

  res.setHeader('content-type', 'text/html; charset=utf-8');

  if (!uid || !token || !process.env.DIGEST_SECRET || !isAdminConfigured()) {
    res.status(400).send(page('Invalid link', 'This link is missing information.'));
    return;
  }

  if (!dailyTokenIsValid(uid, token)) {
    res.status(403).send(page('Invalid link', 'This link is not valid.'));
    return;
  }

  if (req.method !== 'POST') {
    const action = `/api/digest/daily?uid=${encodeURIComponent(uid)}&token=${escapeHtml(token)}`;
    res.status(200).send(
      page(
        'Get the round-up every day?',
        'You’ll get one email each day there are new posts, instead of once a week.',
        `<form method="post" action="${action}" style="margin:0">
          <button type="submit" style="background:#1da1f2;color:#fff;border:0;padding:10px 20px;border-radius:9999px;font-weight:600;font-size:15px;cursor:pointer">Yes, send it daily</button>
        </form>`
      )
    );
    return;
  }

  try {
    await adminDb().doc(`users/${uid}`).update({ emailDigest: 'daily' });
  } catch {
    res
      .status(500)
      .send(page('Something went wrong', 'We could not update your preferences. Please try again later.'));
    return;
  }

  res
    .status(200)
    .send(
      page(
        'You’re on the daily round-up',
        'You’ll now get the round-up every day there’s something new. You can change this any time from your notifications page.'
      )
    );
}
