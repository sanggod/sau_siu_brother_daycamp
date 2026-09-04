/* Offline shell for camp wifi.

   HTML is network-first, so a redeploy is picked up on the next load and the
   operator can never be stuck on a stale page. Everything else (CSS, JS, the
   board artwork, fonts) is cache-first against a versioned cache — bump
   VERSION whenever those files change.

   The game state itself always goes over the live Realtime Database socket;
   nothing here caches or replays it. */
var VERSION = 'flipgame-v1';

/* Clean URLs (firebase.json cleanUrls) — asking for the .html form would be
   a 301, and Cache.add refuses a redirected response. */
var SHELL = [
  './',
  'screen',
  'play',
  'app.css',
  'game.js',
  'sync.js',
  'screen.js',
  'play.js',
  'settings.js',
  'firebase-config.js',
  'favicon.svg',
  'manifest.webmanifest',
  'assets/sau.webp',
  'assets/siu.webp',
  'assets/sau-thumb.webp',
  'vendor/firebase-app-compat.js',
  'vendor/firebase-database-compat.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION)
      // Individually, so one missing file cannot fail the whole install.
      .then(function (c) {
        return Promise.all(SHELL.map(function (url) {
          return c.add(url).catch(function () {});
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === VERSION ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;
  var isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;   // let the database socket alone

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(function (res) {
          if (res && res.ok && !res.redirected) {
            var copy = res.clone();
            caches.open(VERSION).then(function (c) { c.put(req, copy); });
          }
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (hit) {
            return hit || caches.match('./');
          });
        })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && !res.redirected && (res.ok || res.type === 'opaque')) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
