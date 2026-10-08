import { createHmac } from 'crypto';
import { auth } from 'firebase-admin';
import { createTransport } from 'nodemailer';
import { firestore, functions, regionalFunctions } from './lib/utils';
import { EMAIL_API, EMAIL_API_PASSWORD, DIGEST_SECRET } from './lib/env';
import { SITE_URL, FUNCTIONS_BASE_URL } from './lib/constants';
import type { Tweet, User, EmailDigestFrequency } from './types';

/**
 * Applied to accounts that have never chosen a frequency. Set to 'off' if you
 * would rather every user opt in explicitly before receiving any digest.
 */
const DEFAULT_FREQUENCY: EmailDigestFrequency = 'weekly';

/** Cap so a quiet week and a busy week both produce a readable email. */
const MAX_POSTS_PER_EMAIL = 15;

export function createUnsubscribeToken(userId: string): string {
  return createHmac('sha256', DIGEST_SECRET.value())
    .update(userId)
    .digest('hex')
    .slice(0, 32);
}

function buildUnsubscribeUrl(userId: string): string {
  const token = createUnsubscribeToken(userId);
  return `${FUNCTIONS_BASE_URL}/unsubscribeDigest?uid=${userId}&token=${token}`;
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
  frequency: EmailDigestFrequency,
  unsubscribeUrl: string
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

      return `
        <tr><td style="padding:12px 0;border-bottom:1px solid #e6ecf0">
          <div style="font-weight:600;color:#14171a">${escapeHtml(
            authorName
          )} <span style="font-weight:400;color:#687684">@${escapeHtml(
        authorUsername
      )}</span></div>
          <div style="margin:4px 0 8px;color:#14171a;line-height:1.5">${body}${images}</div>
          <a href="${SITE_URL}/tweet/${id}" style="color:#1da1f2;text-decoration:none">Read post →</a>
        </td></tr>`;
    })
    .join('');

  const html = `
  <div style="margin:0;padding:24px;background:#f5f8fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
    <table role="presentation" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px" width="100%">
      <tr><td>
        <h1 style="margin:0 0 4px;font-size:20px;color:#14171a">The Alternative</h1>
        <p style="margin:0 0 16px;color:#687684;font-size:14px">Here's what you missed ${period}.</p>
      </td></tr>
      ${items}
      <tr><td style="padding-top:20px">
        <a href="${SITE_URL}/home" style="display:inline-block;background:#1da1f2;color:#ffffff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-weight:600">Open The Alternative</a>
      </td></tr>
      <tr><td style="padding-top:24px;color:#687684;font-size:12px;line-height:1.5">
        You're receiving this because you have an account on The Alternative.<br>
        <a href="${unsubscribeUrl}" style="color:#687684">Unsubscribe from these emails</a>
      </td></tr>
    </table>
  </div>`;

  const text = [
    `Here's what you missed ${period} on The Alternative.`,
    '',
    ...posts.map(
      ({ id, text: body, authorName, authorUsername }) =>
        `${authorName} (@${authorUsername}): ${
          body ?? 'No text'
        }\n${SITE_URL}/tweet/${id}`
    ),
    '',
    `Unsubscribe: ${unsubscribeUrl}`
  ].join('\n');

  return { subject, html, text };
}

async function sendDigest(frequency: 'daily' | 'weekly'): Promise<void> {
  const since = new Date();

  if (frequency === 'daily') since.setDate(since.getDate() - 1);
  else since.setDate(since.getDate() - 7);

  const tweetsSnapshot = await firestore()
    .collection('tweets')
    .where('createdAt', '>=', since)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  // replies are conversation noise in a digest — only top-level posts
  const tweets = tweetsSnapshot.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as Tweet) }))
    .filter(({ parent }) => !parent);

  if (!tweets.length) {
    functions.logger.info(`No new posts for the ${frequency} digest.`);
    return;
  }

  const usersSnapshot = await firestore().collection('users').get();

  const usersById = new Map<string, User>();
  usersSnapshot.docs.forEach((doc) =>
    usersById.set(doc.id, doc.data() as User)
  );

  const posts: PostForEmail[] = tweets
    .slice(0, MAX_POSTS_PER_EMAIL)
    .map(({ id, text, images, createdBy }) => {
      const author = usersById.get(createdBy);

      return {
        id,
        text,
        imageCount: images?.length ?? 0,
        authorName: author?.name ?? 'Someone',
        authorUsername: author?.username ?? 'unknown'
      };
    });

  const recipients = usersSnapshot.docs.filter((doc) => {
    const { emailDigest } = doc.data() as User;
    return (emailDigest ?? DEFAULT_FREQUENCY) === frequency;
  });

  if (!recipients.length) {
    functions.logger.info(`No ${frequency} digest subscribers.`);
    return;
  }

  const client = createTransport({
    service: 'Gmail',
    auth: { user: EMAIL_API.value(), pass: EMAIL_API_PASSWORD.value() }
  });

  let sent = 0;

  for (const doc of recipients) {
    const userId = doc.id;

    // only posts the reader didn't write themselves
    const theirPosts = posts.filter(
      ({ id }) => tweets.find((t) => t.id === id)?.createdBy !== userId
    );

    if (!theirPosts.length) continue;

    let email: string | undefined;

    try {
      email = (await auth().getUser(userId)).email;
    } catch {
      continue; // account deleted from Auth but left in Firestore
    }

    if (!email) continue;

    const { subject, html, text } = renderEmail(
      theirPosts,
      frequency,
      buildUnsubscribeUrl(userId)
    );

    try {
      await client.sendMail({
        from: `The Alternative <${EMAIL_API.value()}>`,
        to: email,
        subject,
        html,
        text,
        headers: {
          'List-Unsubscribe': `<${buildUnsubscribeUrl(userId)}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        }
      });

      sent += 1;
    } catch (error) {
      functions.logger.error(`Digest to ${userId} failed`, error);
    }
  }

  functions.logger.info(`Sent ${sent} ${frequency} digest emails.`);
}

export const dailyEmailDigest = regionalFunctions.pubsub
  .schedule('0 9 * * *')
  .timeZone('Europe/London')
  .onRun(async (): Promise<void> => sendDigest('daily'));

export const weeklyEmailDigest = regionalFunctions.pubsub
  .schedule('0 9 * * MON')
  .timeZone('Europe/London')
  .onRun(async (): Promise<void> => sendDigest('weekly'));
