// ALFATWIN service worker v6 — network-first for JS/HTML/API,
// cache-first for static assets, and Web Push handler for OS-level pushes
// (works when the PWA is closed on iOS 16.4+, Android, and desktop browsers).

const CACHE = 'alfatwin-v6';
const CORE = ['/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isStatic = /\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname) ||
                   url.pathname.startsWith('/icons/') ||
                   url.pathname.startsWith('/static/media/');

  if (isStatic) {
    e.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
      )
    );
  } else {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req))
    );
  }
});

// ============================================================
// PUSH HANDLER — works when the PWA is closed.
// CRITICAL on iOS: must use event.waitUntil + self.registration.showNotification.
// ============================================================
self.addEventListener('push', (event) => {
  let data = { title: 'ALFATWIN', body: '', url: '/' };
  try {
    if (event.data) {
      const payload = event.data.json();
      data = { ...data, ...payload };
    }
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'alfatwin-notification',
      renotify: true,
      data: { url: data.url || data.link || '/' },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(self.location.origin)) {
          w.navigate(url);
          return w.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(url) : null;
    })
  );
});

// Re-subscribe automatically if the browser invalidates the subscription.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      cs.forEach((c) => c.postMessage({ type: 'PUSH_RESUBSCRIBE_NEEDED' }));
    } catch {}
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
