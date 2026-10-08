import { useState, useEffect, useCallback } from 'react';
import {
  isPushSupported,
  enablePushNotifications
} from '@lib/firebase/messaging';

type PushState = {
  supported: boolean;
  enabled: boolean;
  loading: boolean;
  enable: () => Promise<boolean>;
};

/**
 * Keeps the device's FCM token registered for the signed-in user.
 * If permission was granted previously we re-register silently on load, since
 * tokens rotate and a stale one means notifications quietly stop arriving.
 */
export function usePushNotifications(userId: string | null): PushState {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const init = async (): Promise<void> => {
      const canPush = await isPushSupported();

      if (!active) return;

      setSupported(canPush);

      if (!canPush || !userId) return;

      if (Notification.permission === 'granted') {
        const token = await enablePushNotifications(userId);
        if (active) setEnabled(Boolean(token));
      }
    };

    void init();

    return () => {
      active = false;
    };
  }, [userId]);

  const enable = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;

    setLoading(true);

    const token = await enablePushNotifications(userId);

    setEnabled(Boolean(token));
    setLoading(false);

    return Boolean(token);
  }, [userId]);

  return { supported, enabled, loading, enable };
}
