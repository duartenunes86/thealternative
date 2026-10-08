import {
  adminAuth,
  adminDb,
  adminMessaging,
  isAdminConfigured
} from '@lib/firebase/admin';
import type { NextApiRequest, NextApiResponse } from 'next';

const siteURL = process.env.NEXT_PUBLIC_URL ?? 'https://thealternative.social';

const copy: Record<string, string> = {
  like: 'liked your post',
  reply: 'replied to your post',
  follow: 'followed you'
};

type Body = {
  idToken?: string;
  targetUserId?: string;
  notificationId?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!isAdminConfigured()) {
    // push is simply off until the service account is configured
    res.status(200).json({ sent: 0, reason: 'admin-not-configured' });
    return;
  }

  const { idToken, targetUserId, notificationId } = (req.body ?? {}) as Body;

  if (!idToken || !targetUserId || !notificationId) {
    res.status(400).json({ error: 'Missing fields' });
    return;
  }

  let callerUid: string;

  try {
    ({ uid: callerUid } = await adminAuth().verifyIdToken(idToken));
  } catch {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  const db = adminDb();

  // Read the notification back rather than trusting the request body, so a
  // caller can only trigger a push for something they actually caused.
  const snapshot = await db
    .doc(`users/${targetUserId}/notifications/${notificationId}`)
    .get();

  if (!snapshot.exists) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }

  const { type, fromUserId, tweetId, parentTweetId } = snapshot.data() as {
    type: string;
    fromUserId: string;
    tweetId: string | null;
    parentTweetId: string | null;
  };

  if (fromUserId !== callerUid) {
    res.status(403).json({ error: 'Not your notification' });
    return;
  }

  const tokensSnapshot = await db
    .collection(`users/${targetUserId}/fcmTokens`)
    .get();

  const tokens = tokensSnapshot.docs.map(({ id }) => id);

  if (!tokens.length) {
    res.status(200).json({ sent: 0, reason: 'no-tokens' });
    return;
  }

  const sender = (await db.doc(`users/${fromUserId}`).get()).data() as
    | { name?: string; username?: string; photoURL?: string }
    | undefined;

  const target =
    type === 'follow'
      ? `${siteURL}/user/${sender?.username ?? ''}`
      : `${siteURL}/tweet/${tweetId ?? parentTweetId ?? ''}`;

  const { responses, successCount } = await adminMessaging().sendEachForMulticast(
    {
      tokens,
      data: {
        title: 'The Alternative',
        body: `${sender?.name ?? 'Someone'} ${copy[type] ?? 'interacted with you'}`,
        icon: sender?.photoURL ?? '',
        tag: `${type}__${fromUserId}`,
        url: target
      },
      webpush: { fcmOptions: { link: target } }
    }
  );

  // prune tokens the device has invalidated
  const stale = responses
    .map((response, index) =>
      !response.success &&
      [
        'messaging/invalid-registration-token',
        'messaging/registration-token-not-registered'
      ].includes(response.error?.code ?? '')
        ? tokens[index]
        : null
    )
    .filter((token): token is string => Boolean(token));

  if (stale.length) {
    const batch = db.batch();
    stale.forEach((token) =>
      batch.delete(db.doc(`users/${targetUserId}/fcmTokens/${token}`))
    );
    await batch.commit();
  }

  res.status(200).json({ sent: successCount, pruned: stale.length });
}
