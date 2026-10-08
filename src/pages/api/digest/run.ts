import { createTransport } from 'nodemailer';
import { createHmac } from 'crypto';
import { adminAuth, adminDb, isAdminConfigured } from '@lib/firebase/admin';
import type { NextApiRequest, NextApiResponse } from 'next';

const siteURL = process.env.NEXT_PUBLIC_URL ?? 'https://thealternative.social';

/**
 * Applied to accounts that have never chosen a frequency.
 * Set to 'off' if you would rather every user opt in explicitly.
 */
const DEFAULT_FREQUENCY = 'weekly';

const MAX_POSTS_PER_EMAIL = 15;

function unsubscribeUrl(userId: string): string {
  const token = createHmac('sha256', process.env.DIGEST_SECRET ?? '')
    .update(userId)
    .digest('hex')
    .slice(0, 32);

  return `${siteURL}/api/digest/unsubscribe?uid=${userId}&token=${token}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type PostForEmail = {
  id: string;
  text: string | null;
  imageCount: number;
  authorName: string;
  authorUsername: string;
};

function renderEmail(
  posts: PostForEmail[],
  frequency: string,
  unsubUrl: string
): { subject: string; html: string; text: string } {
  const period = frequency === 'daily' ? 'today' : 'this week';

  const subject =
    posts.length === 1
      ? `1 new post on The Alternative ${period}`
      : `${posts.length} new posts on The Alternative ${period}`;

  const items = posts
    .map(({ id, text, imageCount, authorName, authorUsername }) => {
      const body = text
        ? escapeHtml(text.length > 220 ? `${text.slice(0, 220)}…` : text)
        : '<em>No text</em>';

      const images =
        imageCount > 0
          ? ` <span style="color:#687684">(${imageCount} image${
              imageCount > 1 ? 's' : ''
            })</span>`
          : '';

      return `<tr><td style="padding:12px 0;border-bottom:1px solid #e6ecf0">
        <div style="font-weight:600;color:#14171a">${escapeHtml(authorName)}
          <span style="font-weight:400;color:#687684">@${escapeHtml(
            authorUsername
          )}</span></div>
        <div style="margin:4px 0 8px;color:#14171a;line-height:1.5">${body}${images}</div>
        <a href="${siteURL}/tweet/${id}" style="color:#1da1f2;text-decoration:none">Read post →</a>
      </td></tr>`;
    })
    .join('');

  const html = `<div style="margin:0;padding:24px;background:#f5f8fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
    <table role="presentation" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px" width="100%">
      <tr><td>
        <h1 style="margin:0 0 4px;font-size:20px;color:#14171a">The Alternative</h1>
        <p style="margin:0 0 16px;color:#687684;font-size:14px">Here's what you missed ${period}.</p>
      </td></tr>
      ${items}
      <tr><td style="padding-top:20px">
        <a href="${siteURL}/home" style="display:inline-block;background:#1da1f2;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-weight:600">Open The Alternative</a>
      </td></tr>
      <tr><td style="padding-top:24px;color:#687684;font-size:12px;line-height:1.5">
        You're receiving this because you have an account on The Alternative.<br>
        <a href="${unsubUrl}" style="color:#687684">Unsubscribe from these emails</a>
      </td></tr>
    </table></div>`;

  const text = [
    `Here's what you missed ${period} on The Alternative.`,
    '',
    ...posts.map(
      ({ id, text: body, authorName, authorUsername }) =>
        `${authorName} (@${authorUsername}): ${body ?? 'No text'}\n${siteURL}/tweet/${id}`
    ),
    '',
    `Unsubscribe: ${unsubUrl}`
  ].join('\n');

  return { subject, html, text };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  // Called by an external scheduler, so it is guarded by a shared secret
  // rather than a user session.
  const secret = process.env.DIGEST_SECRET;
  const provided =
    (req.headers['x-digest-secret'] as string | undefined) ??
    (req.query.secret as string | undefined);

  if (!secret || provided !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!isAdminConfigured()) {
    res.status(503).json({ error: 'Server Firebase not configured' });
    return;
  }

  const user = process.env.EMAIL_API;
  const pass = process.env.EMAIL_API_PASSWORD;

  if (!user || !pass) {
    res.status(503).json({ error: 'Email not configured' });
    return;
  }

  // Render blocks outbound SMTP ports on its instances, so an SMTP transport
  // just hangs there. A Resend key (re_...) is therefore sent over their HTTPS
  // API instead; SMTP stays available for hosts that permit it.
  const useResendApi = pass.startsWith('re_');

  const host = process.env.EMAIL_HOST;
  const port = Number(process.env.EMAIL_PORT ?? 465);

  const transport = host
    ? { host, port, secure: port === 465, auth: { user, pass } }
    : { service: 'Gmail', auth: { user, pass } };

  const fromName = process.env.EMAIL_FROM_NAME ?? 'The Alternative';

  // With a relay like Resend the SMTP username is not an address ("resend"),
  // so the visible sender is configured separately.
  const fromAddress: string = process.env.EMAIL_FROM ?? user;
  const apiKey: string = pass;

  const frequency = req.query.frequency === 'daily' ? 'daily' : 'weekly';

  // Safety rails, because this endpoint mails every subscriber the moment it
  // is called:
  //   ?dryRun=1        report who would be mailed, send nothing
  //   ?only=<email>    send to just that address, for a real end-to-end test
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
  const only = typeof req.query.only === 'string' ? req.query.only : null;

  const since = new Date();
  if (frequency === 'daily') since.setDate(since.getDate() - 1);
  else since.setDate(since.getDate() - 7);

  const db = adminDb();

  const tweetsSnapshot = await db
    .collection('tweets')
    .where('createdAt', '>=', since)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  type TweetRow = {
    id: string;
    text: string | null;
    images: unknown[] | null;
    parent: unknown | null;
    createdBy: string;
  };

  // replies are conversation noise in a digest — only top-level posts
  const tweets = tweetsSnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as TweetRow))
    .filter(({ parent }) => !parent);

  if (!tweets.length) {
    res.status(200).json({ sent: 0, reason: 'no-new-posts' });
    return;
  }

  const usersSnapshot = await db.collection('users').get();

  const usersById = new Map<string, Record<string, unknown>>();
  usersSnapshot.docs.forEach((doc) => usersById.set(doc.id, doc.data()));

  const posts: PostForEmail[] = tweets
    .slice(0, MAX_POSTS_PER_EMAIL)
    .map(({ id, text, images, createdBy }) => {
      const author = usersById.get(createdBy);
      return {
        id,
        text: text ?? null,
        imageCount: images?.length ?? 0,
        authorName: (author?.name as string) ?? 'Someone',
        authorUsername: (author?.username as string) ?? 'unknown'
      };
    });

  const recipients = usersSnapshot.docs.filter(
    (doc) =>
      ((doc.data().emailDigest as string) ?? DEFAULT_FREQUENCY) === frequency
  );

  if (!recipients.length) {
    res.status(200).json({ sent: 0, reason: 'no-subscribers' });
    return;
  }

  const client = useResendApi ? null : createTransport(transport);

  async function deliver(
    to: string,
    subject: string,
    html: string,
    text: string,
    unsubUrl: string
  ): Promise<void> {
    if (!useResendApi) {
      await client!.sendMail({
        from: `${fromName} <${fromAddress}>`,
        to,
        subject,
        html,
        text,
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        }
      });
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        from: `${fromName} <${fromAddress}>`,
        to: [to],
        subject,
        html,
        text,
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        }
      })
    });

    if (!response.ok)
      throw new Error(`Resend ${response.status}: ${await response.text()}`);
  }

  let sent = 0;
  const failures: string[] = [];

  for (const doc of recipients) {
    const userId = doc.id;

    const theirPosts = posts.filter(
      (post) => tweets.find((t) => t.id === post.id)?.createdBy !== userId
    );

    if (!theirPosts.length) continue;

    let email: string | undefined;

    try {
      email = (await adminAuth().getUser(userId)).email;
    } catch {
      continue; // deleted from Auth but left in Firestore
    }

    if (!email) continue;

    if (only && email.toLowerCase() !== only.toLowerCase()) continue;

    const unsubUrl = unsubscribeUrl(userId);
    const { subject, html, text } = renderEmail(theirPosts, frequency, unsubUrl);

    if (dryRun) {
      sent += 1;
      continue;
    }

    try {
      await deliver(email, subject, html, text, unsubUrl);
      sent += 1;
    } catch {
      failures.push(userId);
    }
  }

  res.status(200).json({ frequency, dryRun, only, sent, failed: failures.length });
}
