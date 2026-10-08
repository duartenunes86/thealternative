import type { Timestamp, FirestoreDataConverter } from 'firebase/firestore';

export type NotificationType = 'like' | 'reply' | 'follow';

export type Notification = {
  id: string;
  type: NotificationType;
  /** uid of the user who caused the notification */
  fromUserId: string;
  /** the tweet that was liked, or the reply that was posted — null for follows */
  tweetId: string | null;
  /** the tweet being replied to — only set for replies */
  parentTweetId: string | null;
  read: boolean;
  createdAt: Timestamp;
};

export const notificationConverter: FirestoreDataConverter<Notification> = {
  toFirestore(notification) {
    return { ...notification };
  },
  fromFirestore(snapshot, options) {
    const { id } = snapshot;
    const data = snapshot.data(options);

    return { id, ...data } as Notification;
  }
};
