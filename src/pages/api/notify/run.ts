import { Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb, isAdminConfigured } from '@lib/firebase/admin';
import { createMailer, emailConfigured, schedulerAuthorized, unsubscribeUrl } from '@lib/server/mail';
import { buildActivityEmail } from '@lib/server/activity';
import type { ActivityItem } from '@lib/server/activity';
import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Activity emails: new followers, replies, likes and unread messages.
 * Called every 15-30 minutes by the server's scheduler with the shared secret.
 *
 * - On unless the person turned it off (emailActivity: 'off').
 * - At most one email per person per hour (MIN_GAP).
 * - Things only count after QUIET minutes, so people who are online and see
 *   them in the app don't also get an email. Read notifications are skipped.
 *
 *   ?dryRun=1        report who would be emailed, send nothing
 *   ?only=<email>    only send to this address (for a real end-to-end test)
 */
const MIN_GAP_MS = 60 * 60 * 1000;
const QUIET_MS = 10 * 60 * 1000;
const MESSAGE_QUIET_MS = 30 * 60 * 1000;
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

type Notif = { type: 'like' | 'reply' | 'follow'; fromUserId: string; tweetId: string | null; read: boolean; createdAt: Timestamp };
type Conv = { participants: string[]; unread?: Record<string, number>; lastMessage?: { text: string; from: string } | null; updatedAt?: Timestamp };

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
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

  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
  const only = typeof req.query.only === 'string' ? req.query.only.toLowerCase() : null;
  const now = Date.now();
  const db = adminDb();
  const auth = adminAuth();

  const usersSnapshot = await db.collection('users').get();
  const usersById = new Map<string, Record<string, unknown>>();
  usersSnapshot.docs.forEach((doc) => usersById.set(doc.id, doc.data()));
  const who = (uid: string): { fromName: string; fromUsername: string } => {
    const u = usersById.get(uid);
    return { fromName: (u?.name as string) ?? 'Someone', fromUsername: (u?.username as string) ?? 'unknown' };
  };

  const send = dryRun ? null : createMailer();
  const report: { user: string; items: number; lines?: string[] }[] = [];
  let sent = 0;
  let failed = 0;

  for (const userDoc of usersSnapshot.docs) {
    const uid = userDoc.id;
    const data = userDoc.data();
    if (data.emailActivity === 'off') continue;

    const lastSent = (data.activityEmailedAt as Timestamp | undefined)?.toMillis?.() ?? 0;
    if (now - lastSent < MIN_GAP_MS) continue;
    const since = Math.max(lastSent, now - LOOKBACK_MS);

    const notifSnapshot = await db
      .collection(`users/${uid}/notifications`)
      .where('createdAt', '>', Timestamp.fromMillis(since))
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const notifs = notifSnapshot.docs
      .map((d) => d.data() as Notif)
      .filter((n) => !n.read && n.createdAt && n.createdAt.toMillis() < now - QUIET_MS && n.fromUserId !== uid);

    const convSnapshot = await db.collection('conversations').where('participants', 'array-contains', uid).get();
    const convs = convSnapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Conv) }))
      .filter((c) => {
        const t = c.updatedAt?.toMillis?.() ?? 0;
        return (c.unread?.[uid] ?? 0) > 0 && c.lastMessage && c.lastMessage.from !== uid && t > since && t < now - MESSAGE_QUIET_MS;
      });

    if (!notifs.length && !convs.length) continue;

    // texts of the posts that were liked or replied to
    const tweetIds = Array.from(new Set(notifs.filter((n) => n.tweetId).map((n) => n.tweetId as string)));
    const tweetTexts = new Map<string, string | null>();
    if (tweetIds.length) {
      const refs = tweetIds.map((id) => db.doc(`tweets/${id}`));
      const docs = await db.getAll(...refs);
      docs.forEach((d) => tweetTexts.set(d.id, d.exists ? ((d.data()?.text as string | null) ?? null) : null));
    }

    const items: ActivityItem[] = [];
    convs.forEach((c) => {
      const other = c.participants.find((p) => p !== uid) ?? '';
      items.push({ kind: 'message', ...who(other), conversationId: c.id, count: c.unread?.[uid] ?? 1, preview: c.lastMessage?.text ?? '' });
    });
    notifs.forEach((n) => {
      if (n.type === 'follow') items.push({ kind: 'follow', ...who(n.fromUserId) });
      else if (n.type === 'reply' && n.tweetId)
        items.push({ kind: 'reply', ...who(n.fromUserId), replyId: n.tweetId, replyText: tweetTexts.get(n.tweetId) ?? null });
      else if (n.type === 'like' && n.tweetId)
        items.push({ kind: 'like', ...who(n.fromUserId), tweetId: n.tweetId, tweetText: tweetTexts.get(n.tweetId) ?? null });
    });

    const unsub = unsubscribeUrl(uid, 'activity');
    const email = buildActivityEmail(items, unsub);
    if (!email) continue;

    let address: string | undefined;
    try {
      address = (await auth.getUser(uid)).email;
    } catch {
      continue; // deleted from Auth but left in Firestore
    }
    if (!address) continue;
    if (only && address.toLowerCase() !== only) continue;

    if (dryRun) {
      report.push({ user: uid, items: items.length, lines: email.lines });
      sent += 1;
      continue;
    }

    try {
      await (send as ReturnType<typeof createMailer>)({ to: address, subject: email.subject, html: email.html, text: email.text, unsubUrl: unsub });
      await userDoc.ref.update({ activityEmailedAt: Timestamp.fromMillis(now) });
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  res.status(200).json({ dryRun, only, sent, failed, ...(dryRun ? { report } : {}) });
}
