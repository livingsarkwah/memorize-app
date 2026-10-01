/*
 * Memorize service worker.
 *
 * The build (pwa/vite-plugin-sw.ts) fills in the two placeholders below: the version is a hash of
 * every file in the build, so any change produces a new cache, and the list is every file to cache. The whole app is cached on install, so
 * once it has loaded once it opens with no network at all. Texts and audio live in IndexedDB, not here.
 *
 * A new version installs in the background and waits; it takes over when the page asks (the app shows
 * "Update ready") or the next time the app is opened. It never swaps in the middle of a practice session.
 */
const VERSION = '__VERSION__';
const CACHE = `memorize-${VERSION}`;
const PRECACHE = __PRECACHE__;

const inScope = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map(inScope))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('memorize-') && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Every page load is the same single-page app shell (routes live in the URL hash).
      if (request.mode === 'navigate') return (await cache.match(inScope('index.html'))) || fetch(request);
      return (await cache.match(request, { ignoreSearch: true })) || fetch(request);
    })(),
  );
});
