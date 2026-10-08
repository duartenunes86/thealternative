import {
  doc,
  query,
  where,
  limit,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  increment,
  writeBatch,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  getCountFromServer
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from './app';
import {
  usersCollection,
  tweetsCollection,
  userStatsCollection,
  userBookmarksCollection,
  userNotificationsCollection
} from './collections';
import type { WithFieldValue, Query } from 'firebase/firestore';
import type { Notification, NotificationType } from '@lib/types/notification';
import type { EditableUserData, EmailDigestFrequency } from '@lib/types/user';
import type { FilesWithId, ImagesPreview } from '@lib/types/file';
import type { Bookmark } from '@lib/types/bookmark';
import type { Theme, Accent } from '@lib/types/theme';

export async function checkUsernameAvailability(
  username: string
): Promise<boolean> {
  const { empty } = await getDocs(
    query(usersCollection, where('username', '==', username), limit(1))
  );
  return empty;
}

export async function getCollectionCount<T>(
  collection: Query<T>
): Promise<number> {
  const snapshot = await getCountFromServer(collection);
  return snapshot.data().count;
}

export async function updateUserData(
  userId: string,
  userData: EditableUserData
): Promise<void> {
  const userRef = doc(usersCollection, userId);
  await updateDoc(userRef, {
    ...userData,
    updatedAt: serverTimestamp()
  });
}

export async function updateUserTheme(
  userId: string,
  themeData: { theme?: Theme; accent?: Accent }
): Promise<void> {
  const userRef = doc(usersCollection, userId);
  await updateDoc(userRef, { ...themeData });
}

export async function updateUsername(
  userId: string,
  username?: string
): Promise<void> {
  const userRef = doc(usersCollection, userId);
  await updateDoc(userRef, {
    ...(username && { username }),
    updatedAt: serverTimestamp()
  });
}

export async function managePinnedTweet(
  type: 'pin' | 'unpin',
  userId: string,
  tweetId: string
): Promise<void> {
  const userRef = doc(usersCollection, userId);
  await updateDoc(userRef, {
    updatedAt: serverTimestamp(),
    pinnedTweet: type === 'pin' ? tweetId : null
  });
}

export async function manageFollow(
  type: 'follow' | 'unfollow',
  userId: string,
  targetUserId: string
): Promise<void> {
  const batch = writeBatch(db);

  const userDocRef = doc(usersCollection, userId);
  const targetUserDocRef = doc(usersCollection, targetUserId);

  if (type === 'follow') {
    batch.update(userDocRef, {
      following: arrayUnion(targetUserId),
      updatedAt: serverTimestamp()
    });
    batch.update(targetUserDocRef, {
      followers: arrayUnion(userId),
      updatedAt: serverTimestamp()
    });
  } else {
    batch.update(userDocRef, {
      following: arrayRemove(targetUserId),
      updatedAt: serverTimestamp()
    });
    batch.update(targetUserDocRef, {
      followers: arrayRemove(userId),
      updatedAt: serverTimestamp()
    });
  }

  await batch.commit();

  if (type === 'follow')
    await addNotification({
      type: 'follow',
      targetUserId,
      fromUserId: userId
    });
  else await removeNotification('follow', targetUserId, userId);
}

/**
 * Deterministic ids let us delete the matching notification again when the
 * action is undone (unlike, unfollow) instead of searching for it.
 */
function getNotificationId(
  type: NotificationType,
  fromUserId: string,
  tweetId?: string
): string {
  if (type === 'follow') return `follow__${fromUserId}`;
  if (type === 'like') return `like__${tweetId as string}__${fromUserId}`;
  return `reply__${tweetId as string}`;
}

type AddNotificationParams = {
  type: NotificationType;
  targetUserId: string;
  fromUserId: string;
  tweetId?: string;
  parentTweetId?: string;
};

export async function addNotification({
  type,
  targetUserId,
  fromUserId,
  tweetId,
  parentTweetId
}: AddNotificationParams): Promise<void> {
  // never notify people about their own actions
  if (targetUserId === fromUserId) return;

  const id = getNotificationId(type, fromUserId, tweetId);

  const data: WithFieldValue<Omit<Notification, 'id'>> = {
    type,
    fromUserId,
    tweetId: tweetId ?? null,
    parentTweetId: parentTweetId ?? null,
    read: false,
    createdAt: serverTimestamp()
  };

  try {
    await setDoc(doc(userNotificationsCollection(targetUserId), id), data);
    await triggerPush(targetUserId, id);
  } catch {
    // a failed notification must never break the action that triggered it
  }
}

/**
 * Asks the server to push this notification to the recipient's devices.
 * Runs in Next rather than a Cloud Function so the project does not need a
 * Firebase Blaze plan. Failures are ignored — the in-app notification is
 * already written, push is a bonus.
 */
async function triggerPush(
  targetUserId: string,
  notificationId: string
): Promise<void> {
  try {
    const idToken = await auth.currentUser?.getIdToken();

    if (!idToken) return;

    await fetch('/api/push/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken, targetUserId, notificationId })
    });
  } catch {
    // offline, blocked, or push not configured — not worth surfacing
  }
}

export async function removeNotification(
  type: NotificationType,
  targetUserId: string,
  fromUserId: string,
  tweetId?: string
): Promise<void> {
  if (targetUserId === fromUserId) return;

  const id = getNotificationId(type, fromUserId, tweetId);

  try {
    await deleteDoc(doc(userNotificationsCollection(targetUserId), id));
  } catch {
    // ignore — the notification may already be gone
  }
}

export async function markNotificationsAsRead(
  userId: string,
  notificationIds: string[]
): Promise<void> {
  if (!notificationIds.length) return;

  const batch = writeBatch(db);

  notificationIds.forEach((id) =>
    batch.update(doc(userNotificationsCollection(userId), id), { read: true })
  );

  await batch.commit();
}

export async function updateEmailDigest(
  userId: string,
  frequency: EmailDigestFrequency
): Promise<void> {
  await updateDoc(doc(usersCollection, userId), {
    emailDigest: frequency,
    updatedAt: serverTimestamp()
  });
}

export async function clearAllNotifications(userId: string): Promise<void> {
  const { docs } = await getDocs(userNotificationsCollection(userId));

  const batch = writeBatch(db);

  docs.forEach(({ id }) =>
    batch.delete(doc(userNotificationsCollection(userId), id))
  );

  await batch.commit();
}

/** Looks up who owns a tweet so we know who to notify. */
async function getTweetOwnerId(tweetId: string): Promise<string | null> {
  try {
    const snapshot = await getDoc(doc(tweetsCollection, tweetId));
    return snapshot.data()?.createdBy ?? null;
  } catch {
    return null;
  }
}

export async function addReplyNotification(
  parentTweetId: string,
  fromUserId: string,
  replyTweetId: string
): Promise<void> {
  const targetUserId = await getTweetOwnerId(parentTweetId);

  if (!targetUserId) return;

  await addNotification({
    type: 'reply',
    targetUserId,
    fromUserId,
    tweetId: replyTweetId,
    parentTweetId
  });
}

export async function removeTweet(tweetId: string): Promise<void> {
  const userRef = doc(tweetsCollection, tweetId);
  await deleteDoc(userRef);
}

export async function uploadImages(
  userId: string,
  files: FilesWithId
): Promise<ImagesPreview | null> {
  if (!files.length) return null;

  const imagesPreview = await Promise.all(
    files.map(async (file) => {
      const { id, name: alt, type } = file;

      const storageRef = ref(storage, `images/${userId}/${id}`);

      await uploadBytesResumable(storageRef, file);

      const src = await getDownloadURL(storageRef);

      return { id, src, alt, type };
    })
  );

  return imagesPreview;
}

export async function manageReply(
  type: 'increment' | 'decrement',
  tweetId: string
): Promise<void> {
  const tweetRef = doc(tweetsCollection, tweetId);

  try {
    await updateDoc(tweetRef, {
      userReplies: increment(type === 'increment' ? 1 : -1),
      updatedAt: serverTimestamp()
    });
  } catch {
    // do nothing, because parent tweet was already deleted
  }
}

export async function manageTotalTweets(
  type: 'increment' | 'decrement',
  userId: string
): Promise<void> {
  const userRef = doc(usersCollection, userId);
  await updateDoc(userRef, {
    totalTweets: increment(type === 'increment' ? 1 : -1),
    updatedAt: serverTimestamp()
  });
}

export async function manageTotalPhotos(
  type: 'increment' | 'decrement',
  userId: string
): Promise<void> {
  const userRef = doc(usersCollection, userId);
  await updateDoc(userRef, {
    totalPhotos: increment(type === 'increment' ? 1 : -1),
    updatedAt: serverTimestamp()
  });
}

export function manageRetweet(
  type: 'retweet' | 'unretweet',
  userId: string,
  tweetId: string
) {
  return async (): Promise<void> => {
    const batch = writeBatch(db);

    const tweetRef = doc(tweetsCollection, tweetId);
    const userStatsRef = doc(userStatsCollection(userId), 'stats');

    if (type === 'retweet') {
      batch.update(tweetRef, {
        userRetweets: arrayUnion(userId),
        updatedAt: serverTimestamp()
      });
      batch.update(userStatsRef, {
        tweets: arrayUnion(tweetId),
        updatedAt: serverTimestamp()
      });
    } else {
      batch.update(tweetRef, {
        userRetweets: arrayRemove(userId),
        updatedAt: serverTimestamp()
      });
      batch.update(userStatsRef, {
        tweets: arrayRemove(tweetId),
        updatedAt: serverTimestamp()
      });
    }

    await batch.commit();
  };
}

export function manageLike(
  type: 'like' | 'unlike',
  userId: string,
  tweetId: string
) {
  return async (): Promise<void> => {
    const batch = writeBatch(db);

    const userStatsRef = doc(userStatsCollection(userId), 'stats');
    const tweetRef = doc(tweetsCollection, tweetId);

    if (type === 'like') {
      batch.update(tweetRef, {
        userLikes: arrayUnion(userId),
        updatedAt: serverTimestamp()
      });
      batch.update(userStatsRef, {
        likes: arrayUnion(tweetId),
        updatedAt: serverTimestamp()
      });
    } else {
      batch.update(tweetRef, {
        userLikes: arrayRemove(userId),
        updatedAt: serverTimestamp()
      });
      batch.update(userStatsRef, {
        likes: arrayRemove(tweetId),
        updatedAt: serverTimestamp()
      });
    }

    await batch.commit();

    const targetUserId = await getTweetOwnerId(tweetId);

    if (!targetUserId) return;

    if (type === 'like')
      await addNotification({
        type: 'like',
        targetUserId,
        fromUserId: userId,
        tweetId
      });
    else await removeNotification('like', targetUserId, userId, tweetId);
  };
}

export async function manageBookmark(
  type: 'bookmark' | 'unbookmark',
  userId: string,
  tweetId: string
): Promise<void> {
  const bookmarkRef = doc(userBookmarksCollection(userId), tweetId);

  if (type === 'bookmark') {
    const bookmarkData: WithFieldValue<Bookmark> = {
      id: tweetId,
      createdAt: serverTimestamp()
    };
    await setDoc(bookmarkRef, bookmarkData);
  } else await deleteDoc(bookmarkRef);
}

export async function clearAllBookmarks(userId: string): Promise<void> {
  const bookmarksRef = userBookmarksCollection(userId);
  const bookmarksSnapshot = await getDocs(bookmarksRef);

  const batch = writeBatch(db);

  bookmarksSnapshot.forEach(({ ref }) => batch.delete(ref));

  await batch.commit();
}
