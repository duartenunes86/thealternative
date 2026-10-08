import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseConfig } from './config';
import { userFcmTokensCollection } from './collections';
import type { Messaging } from 'firebase/messaging';

const VAPID_KEY = process.env.NEXT_PUBLIC_FCM_VAPID_KEY;

/** Push needs a service worker, the Notification API, and a VAPID key. */
export async function isPushSupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!VAPID_KEY) return false;
  if (!('serviceWorker' in navigator) || !('Notification' in window))
    return false;

  return isSupported();
}

/**
 * The service worker can't read env vars, so the (public) Firebase config is
 * handed to it as query params instead of being duplicated in the file.
 */
async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const { measurementId, ...config } = getFirebaseConfig();

  const params = new URLSearchParams(
    Object.entries(config).filter(([, value]) => Boolean(value)) as [
      string,
      string
    ][]
  );

  return navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?${params.toString()}`,
    { scope: '/' }
  );
}

let messagingInstance: Messaging | null = null;

function getMessagingInstance(): Messaging {
  if (!messagingInstance) messagingInstance = getMessaging();
  return messagingInstance;
}

/**
 * Asks for permission (if not already decided), then stores the device token
 * so Cloud Functions can push to it. Returns the token, or null if unavailable.
 */
export async function enablePushNotifications(
  userId: string
): Promise<string | null> {
  if (!(await isPushSupported())) return null;

  const permission =
    Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;

  if (permission !== 'granted') return null;

  try {
    const registration = await registerServiceWorker();

    const token = await getToken(getMessagingInstance(), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (!token) return null;

    await setDoc(doc(userFcmTokensCollection(userId), token), {
      token,
      userAgent: navigator.userAgent.slice(0, 300),
      createdAt: serverTimestamp()
    });

    return token;
  } catch {
    // denied, blocked, or unsupported — push simply stays off
    return null;
  }
}

export async function disablePushNotifications(
  userId: string,
  token: string
): Promise<void> {
  try {
    await deleteDoc(doc(userFcmTokensCollection(userId), token));
  } catch {
    // already gone
  }
}
