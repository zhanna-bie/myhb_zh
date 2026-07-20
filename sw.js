const CACHE = 'birthday-party-v5';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './js/firebase.js', './js/utils.js', './js/gallery.js', './manifest.webmanifest'];

self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));

// Network-first for same-origin requests: guests always get the freshest HTML/CSS/JS,
// so a deploy can never leave a stale index.html paired with newer assets (the
// version-skew that produced blank screens). Cache is only a fallback for offline use.
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || (request.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
