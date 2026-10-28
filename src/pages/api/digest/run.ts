import { adminAuth, adminDb, isAdminConfigured } from '@lib/firebase/admin';
import {
  siteURL,
  postalAddress,
  escapeHtml,
  unsubscribeUrl as makeUnsubscribeUrl,
  createMailer,
  emailConfigured,
  schedulerAuthorized
} from '@lib/server/mail';
import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Applied to accounts that have never chosen a frequency.
 *
 * 'off' means nobody is mailed until they explicitly opt in. This is
 * deliberate: the operator is UK-established, so PECR applies to its sending
 * regardless of where recipients live, and PECR's soft opt-in exception does
 * not cover a free service (it requires a sale or negotiations for one).
 * Opt-in also keeps the list engaged, which protects sender reputation.
 * New accounts are asked once on the home page (DigestPrompt).
 */
const DEFAULT_FREQUENCY = 'off';

const MAX_POSTS_PER_EMAIL = 15;
const MAX_MEMBERS_PER_EMAIL = 8;

const unsubscribeUrl = (userId: string): string => makeUnsubscribeUrl(userId, 'digest');

type MemberForEmail = { name: string; username: string; bio: string | null };

type PostForEmail = {
  id: string;
  text: string | null;
  imageCount: number;
  authorName: string;
  authorUsername: string;
};

function renderEmail(
  posts: PostForEmail[],
  members: MemberForEmail[],
  frequency: string,
  unsubUrl: string
): { subject: string; html: string; text: string } {
  const period = frequency === 'daily' ? 'today' : 'this week';

  const postsPart = posts.length === 1 ? '1 new post' : `${posts.length} new posts`;
  const membersPart = members.length
    ? ` and ${members.length} new member${members.length > 1 ? 's' : ''}`
    : '';
  const subject = posts.length
    ? `${postsPart}${membersPart} on The Alternative ${period}`
    : `${members.length} new member${members.length > 1 ? 's' : ''} joined The Alternative ${period}`;

  const memberRows = members.length
    ? '<tr><td style="padding:18px 0 4px;font-weight:700;color:#14171a">New members</td></tr>' +
      members
        .map(
          ({ name, username, bio }) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e6ecf0">
        <a href="${siteURL}/user/${escapeHtml(username)}" style="color:#14171a;text-decoration:none;font-weight:600">${escapeHtml(name)}</a>
        <span style="color:#687684">@${escapeHtml(username)}</span>
        ${bio ? `<div style="color:#687684;font-size:14px;margin-top:2px">${escapeHtml(bio.length > 120 ? `${bio.slice(0, 120)}…` : bio)}</div>` : ''}
      </td></tr>`
        )
        .join('')
    : '';

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
      ${memberRows}
      <tr><td style="padding-top:20px">
        <a href="${siteURL}/home" style="display:inline-block;background:#1da1f2;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-weight:600">Open The Alternative</a>
      </td></tr>
      <tr><td style="padding-top:24px;color:#687684;font-size:12px;line-height:1.5">
        You asked to receive these round-ups from The Alternative.<br>
        <a href="${unsubUrl}" style="color:#687684">Unsubscribe from these emails</a>
        ${postalAddress ? `<br><br>${escapeHtml(postalAddress)}` : ''}
      </td></tr>
    </table></div>`;

  const text = [
    `Here's what you missed ${period} on The Alternative.`,
    '',
    ...posts.map(
      ({ id, text: body, authorName, authorUsername }) =>
        `${authorName} (@${authorUsername}): ${body ?? 'No text'}\n${siteURL}/tweet/${id}`
    ),
    ...(members.length
      ? ['', 'New members:', ...members.map(({ name, username }) => `${name} (@${username}) ${siteURL}/user/${username}`)]
      : []),
    '',
    `Unsubscribe: ${unsubUrl}`,
    ...(postalAddress ? ['', postalAddress] : [])
  ].join('\n');

  return { subject, html, text };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  // Called by the server's scheduler, so it is guarded by a shared secret
  // rather than a user session.
  if (!schedulerAuthorized(req.headers['x-digest-secret'], req.query.secret)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!isAdminConfigured()) {
    res.status(503).json({ error: 'Server Firebase not configured' });
    return;
  }

  if (!emailConfigured()) {
    res.status(503).json({ error: 'Email not configured' });
    return;
  }

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

  const usersSnapshot = await db.collection('users').get();

  const createdMs = (value: unknown): number =>
    (value as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;

  const newMembers = usersSnapshot.docs
    .map((doc): Record<string, unknown> & { id: string } => ({ id: doc.id, ...doc.data() }))
    .filter((u) => createdMs(u.createdAt) >= since.getTime())
    .sort((a, b) => createdMs(b.createdAt) - createdMs(a.createdAt));

  if (!tweets.length && !newMembers.length) {
    res.status(200).json({ sent: 0, reason: 'nothing-new' });
    return;
  }

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

  const deliver = createMailer();

  let sent = 0;
  const failures: string[] = [];

  for (const doc of recipients) {
    const userId = doc.id;

    const theirPosts = posts.filter(
      (post) => tweets.find((t) => t.id === post.id)?.createdBy !== userId
    );

    const theirMembers: MemberForEmail[] = newMembers
      .filter((m) => m.id !== userId)
      .slice(0, MAX_MEMBERS_PER_EMAIL)
      .map((m) => ({
        name: (m.name as string) ?? 'Someone',
        username: (m.username as string) ?? 'unknown',
        bio: (m.bio as string | null) ?? null
      }));

    if (!theirPosts.length && !theirMembers.length) continue;

    let email: string | undefined;

    try {
      email = (await adminAuth().getUser(userId)).email;
    } catch {
      continue; // deleted from Auth but left in Firestore
    }

    if (!email) continue;

    if (only && email.toLowerCase() !== only.toLowerCase()) continue;

    const unsubUrl = unsubscribeUrl(userId);
    const { subject, html, text } = renderEmail(theirPosts, theirMembers, frequency, unsubUrl);

    if (dryRun) {
      sent += 1;
      continue;
    }

    try {
      await deliver({ to: email, subject, html, text, unsubUrl });
      sent += 1;
    } catch {
      failures.push(userId);
    }
  }

  res.status(200).json({ frequency, dryRun, only, sent, failed: failures.length });
}
