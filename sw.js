// BOOK WORM – service worker: appka działa offline, okładki są zapamiętywane.
// Uwaga: Seans i BOOK WORM mają ten sam adres główny, więc czyścimy tylko własne pamięci (prefiks "bookworm-").
const VERSION = 'bookworm-v2';
const IMG = 'bookworm-img';
const FONTS = 'bookworm-fonts';
const SHELL = ['./', './index.html', './style.css', './app.js', './scanner.js', './manifest.webmanifest', './icons/icon-192.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bookworm-') && ![VERSION, IMG, FONTS].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Dane o książkach: zawsze z sieci.
  if (url.hostname === 'www.googleapis.com' || url.hostname === 'openlibrary.org') return;

  // Okładki: najpierw pamięć, potem sieć.
  if (url.hostname === 'books.google.com' || url.hostname.endsWith('books.googleusercontent.com') || url.hostname === 'covers.openlibrary.org' || url.hostname.endsWith('archive.org')) {
    event.respondWith(cacheFirst(req, IMG));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(req, FONTS));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
  }
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return hit || Response.error();
  }
}
