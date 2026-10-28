import { collection } from 'firebase/firestore';
import { userConverter } from '@lib/types/user';
import { tweetConverter } from '@lib/types/tweet';
import { bookmarkConverter } from '@lib/types/bookmark';
import { statsConverter } from '@lib/types/stats';
import { notificationConverter } from '@lib/types/notification';
import { conversationConverter, messageConverter } from '@lib/types/message';
import { db } from './app';
import type { CollectionReference } from 'firebase/firestore';
import type { Bookmark } from '@lib/types/bookmark';
import type { Stats } from '@lib/types/stats';
import type { Notification } from '@lib/types/notification';
import type { Message } from '@lib/types/message';

export const usersCollection = collection(db, 'users').withConverter(
  userConverter
);

export const tweetsCollection = collection(db, 'tweets').withConverter(
  tweetConverter
);

export function userBookmarksCollection(
  id: string
): CollectionReference<Bookmark> {
  return collection(db, `users/${id}/bookmarks`).withConverter(
    bookmarkConverter
  );
}

export function userStatsCollection(id: string): CollectionReference<Stats> {
  return collection(db, `users/${id}/stats`).withConverter(statsConverter);
}

export function userNotificationsCollection(
  id: string
): CollectionReference<Notification> {
  return collection(db, `users/${id}/notifications`).withConverter(
    notificationConverter
  );
}

/** One document per device, keyed by the FCM registration token. */
export function userFcmTokensCollection(id: string): CollectionReference {
  return collection(db, `users/${id}/fcmTokens`);
}

export const conversationsCollection = collection(db, 'conversations').withConverter(
  conversationConverter
);

export function conversationMessagesCollection(
  conversationId: string
): CollectionReference<Message> {
  return collection(db, `conversations/${conversationId}/messages`).withConverter(
    messageConverter
  );
}

