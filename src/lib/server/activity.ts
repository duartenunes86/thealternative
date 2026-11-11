import { escapeHtml, siteURL, emailFrame } from './mail';

/** One thing that happened to the person since their last activity email. */
export type ActivityItem =
  | { kind: 'follow'; fromName: string; fromUsername: string }
  | { kind: 'reply'; fromName: string; fromUsername: string; replyId: string; replyText: string | null }
  | { kind: 'like'; fromName: string; fromUsername: string; tweetId: string; tweetText: string | null }
  | { kind: 'message'; fromName: string; fromUsername: string; conversationId: string; count: number; preview: string };

const clip = (text: string | null, n = 120): string =>
  !text ? '' : text.length > n ? `${text.slice(0, n).trimEnd()}…` : text;

function names(people: { fromName: string }[]): string {
  const unique = Array.from(new Set(people.map((p) => p.fromName)));
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique[0]}, ${unique[1]} and ${unique.length - 2} other${unique.length - 2 > 1 ? 's' : ''}`;
}

export type ActivityEmail = { subject: string; html: string; text: string; lines: string[] };

/**
 * Turns raw activity into one short email: messages first, then replies,
 * new followers, and likes grouped per post.
 */
export function buildActivityEmail(items: ActivityItem[], unsubUrl: string): ActivityEmail | null {
  if (!items.length) return null;

  const messages = items.filter((i): i is Extract<ActivityItem, { kind: 'message' }> => i.kind === 'message');
  const replies = items.filter((i): i is Extract<ActivityItem, { kind: 'reply' }> => i.kind === 'reply');
  const follows = items.filter((i): i is Extract<ActivityItem, { kind: 'follow' }> => i.kind === 'follow');
  const likes = items.filter((i): i is Extract<ActivityItem, { kind: 'like' }> => i.kind === 'like');

  const rows: { html: string; text: string; line: string }[] = [];
  const row = (headline: string, detail: string, href: string, cta: string): void => {
    rows.push({
      line: headline,
      html: `<tr><td style="padding:12px 0;border-bottom:1px solid #e6ecf0">
        <div style="font-weight:600;color:#14171a">${escapeHtml(headline)}</div>
        ${detail ? `<div style="margin:4px 0 8px;color:#14171a;line-height:1.5">${escapeHtml(detail)}</div>` : ''}
        <a href="${href}" style="color:#1da1f2;text-decoration:none">${cta} →</a></td></tr>`,
      text: `${headline}${detail ? `\n${detail}` : ''}\n${href}`
    });
  };

  messages.forEach((m) =>
    row(
      `${m.count} new message${m.count > 1 ? 's' : ''} from ${m.fromName} (@${m.fromUsername})`,
      `“${clip(m.preview)}”`,
      `${siteURL}/messages/${m.conversationId}`,
      'Reply'
    )
  );

  replies.forEach((r) =>
    row(`${r.fromName} (@${r.fromUsername}) replied to your post`, r.replyText ? `“${clip(r.replyText)}”` : '', `${siteURL}/tweet/${r.replyId}`, 'See the reply')
  );

  if (follows.length)
    row(
      `${names(follows)} followed you`,
      '',
      follows.length === 1 ? `${siteURL}/user/${follows[0].fromUsername}` : `${siteURL}/notifications`,
      follows.length === 1 ? 'See their profile' : 'See who'
    );

  const likesByPost = new Map<string, typeof likes>();
  likes.forEach((l) => likesByPost.set(l.tweetId, [...(likesByPost.get(l.tweetId) ?? []), l]));
  likesByPost.forEach((group, tweetId) =>
    row(
      `${names(group)} liked your post`,
      group[0].tweetText ? `“${clip(group[0].tweetText)}”` : '',
      `${siteURL}/tweet/${tweetId}`,
      'See the post'
    )
  );

  const more = rows.length - 1;
  const subject = more ? `${rows[0].line} + ${more} more update${more > 1 ? 's' : ''}` : rows[0].line;

  const html = emailFrame(
    'Here’s what happened while you were away.',
    rows.map((r) => r.html).join(''),
    'You get these emails because of activity on your account. At most one an hour.',
    unsubUrl,
    'Turn off activity emails'
  );

  const text = ['Here’s what happened on The Alternative while you were away.', '', ...rows.map((r) => r.text), '', `Turn off activity emails: ${unsubUrl}`].join('\n\n');

  return { subject: subject.length > 120 ? `${subject.slice(0, 117)}…` : subject, html, text, lines: rows.map((r) => r.line) };
}
