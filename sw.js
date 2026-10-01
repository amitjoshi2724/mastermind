/**
 * Mastermind - Service Worker
 * Provides 100% offline gameplay, persistent asset caching, and background updates.
 */

const CACHE_NAME = 'mastermind-v1.0.0';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './favicon.ico',
  './css/style.css',
  './css/modals.css',
  './js/board.js',
  './js/engine.js',
  './js/classic.js',
  './js/daily.js',
  './js/storage.js',
  './js/ui.js',
  './js/auth.js',
  './js/firebase-config.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        CORE_ASSETS.map((assetUrl) =>
          cache.add(assetUrl).catch((err) => {
            console.warn(`[SW] Warning: could not pre-cache ${assetUrl}:`, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip caching external cloud APIs (firebase, ko-fi, googleapis)
  if (url.origin !== self.location.origin) {
    return;
  }

  const isNavigation = event.request.mode === 'navigate';
  const isScriptOrHtml = event.request.destination === 'script' ||
                         url.pathname.endsWith('.js') ||
                         url.pathname.endsWith('.html');

  if (isNavigation || isScriptOrHtml) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => cached || caches.match('./index.html'));
        })
    );
    return;
  }

  // Cache-first for images, fonts, styles
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        const clone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return networkResponse;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
