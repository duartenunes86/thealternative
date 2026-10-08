/* eslint-disable no-undef */

// Firebase config is passed in as query params when the worker is registered,
// so the public keys only ever live in one place (the app's env vars).
importScripts(
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js'
);
importScripts(
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js'
);

const params = new URL(self.location).searchParams;

firebase.initializeApp({
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId')
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(({ data }) => {
  if (!data) return;

  self.registration.showNotification(data.title ?? 'The Alternative', {
    body: data.body ?? '',
    icon: data.icon || '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.tag || undefined,
    data: { url: data.url || '/notifications' }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url ?? '/notifications';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // focus an existing tab if the app is already open
        for (const client of clientList)
          if ('focus' in client) {
            client.navigate(url);
            return client.focus();
          }

        return self.clients.openWindow(url);
      })
  );
});
