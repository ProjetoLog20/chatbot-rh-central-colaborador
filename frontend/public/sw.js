self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Yuri', body: event.data ? event.data.text() : 'Voce recebeu uma nova notificacao.' };
  }

  const title = data.title || 'Yuri - Central do Colaborador';
  const options = {
    body: data.body || 'Voce recebeu uma nova notificacao.',
    icon: '/rh-logo.jpg',
    badge: '/rh-logo.jpg',
    tag: data.tag || 'yuri-notificacao',
    renotify: data.priority === 'urgente',
    requireInteraction: data.priority === 'urgente',
    data: {
      url: data.url || '/',
      notificationId: data.notificationId || null
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus();
        if ('navigate' in client) await client.navigate(targetUrl);
        return;
      }
    }
    await self.clients.openWindow(targetUrl);
  })());
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
