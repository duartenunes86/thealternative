import type { firestore } from 'firebase-admin';

export type NotificationType = 'like' | 'reply' | 'follow';

export type Notification = {
  type: NotificationType;
  fromUserId: string;
  tweetId: string | null;
  parentTweetId: string | null;
  read: boolean;
  createdAt: firestore.Timestamp;
};

export type FcmToken = {
  token: string;
  userAgent?: string;
  createdAt: firestore.Timestamp;
};
