import { messaging } from 'firebase-admin';
import { firestore, functions, regionalFunctions } from './lib/utils';
import { SITE_URL } from './lib/constants';
import type { Notification, NotificationType } from './types/notification';
import type { User } from './types';

const copy: Record<NotificationType, string> = {
  like: 'liked your post',
  reply: 'replied to your post',
  follow: 'followed you'
};

export const sendPushNotification = regionalFunctions.firestore
  .document('users/{userId}/notifications/{notificationId}')
  .onCreate(async (snapshot, context): Promise<void> => {
    const { userId } = context.params;

    const { type, fromUserId, tweetId, parentTweetId } =
      snapshot.data() as Notification;

    const tokensSnapshot = await firestore()
      .collection(`users/${userId}/fcmTokens`)
      .get();

    const tokens = tokensSnapshot.docs.map(({ id }) => id);

    if (!tokens.length) return;

    const sender = (
      await firestore().doc(`users/${fromUserId}`).get()
    ).data() as User | undefined;

    if (!sender) return;

    const target =
      type === 'follow'
        ? `${SITE_URL}/user/${sender.username}`
        : `${SITE_URL}/tweet/${tweetId ?? parentTweetId ?? ''}`;

    // data-only payload: the service worker renders it, so the copy and the
    // click target stay in one place instead of being split with the browser
    const { responses } = await messaging().sendMulticast({
      tokens,
      data: {
        title: 'The Alternative',
        body: `${sender.name} ${copy[type]}`,
        icon: sender.photoURL ?? '',
        tag: `${type}__${fromUserId}`,
        url: target
      },
      webpush: {
        fcmOptions: { link: target }
      }
    });

    // drop tokens the device has invalidated, so the list doesn't grow stale
    const staleTokens = responses
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

    if (staleTokens.length) {
      const batch = firestore().batch();

      staleTokens.forEach((token) =>
        batch.delete(firestore().doc(`users/${userId}/fcmTokens/${token}`))
      );

      await batch.commit();

      functions.logger.info(`Removed ${staleTokens.length} stale FCM tokens.`);
    }
  });
