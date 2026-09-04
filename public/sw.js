/* Offline shell for camp wifi.

   Code (HTML, CSS, JS) is network-first: a redeploy reaches a phone on its
   next load. Cache-first was wrong here — the new worker installs during the
   load it is meant to fix, so the page had already been served stale JS by the
   outgoing worker and it took TWO reloads before a deploy actually landed.
   That is fine on a laptop and useless on camp day, when the change you just
   pushed is a timer setting and eight phones are already open.

   A slow network cannot hold the page hostage either: after NET_TIMEOUT the
   cached copy wins, and the response still lands in the cache for next time.

   The board artwork, the pinned SDK and the font files stay cache-first —
   their content never changes without their name changing.

   The game state itself always goes over the live Realtime Database socket;
   nothing here caches or replays it. */
var VERSION = 'flipgame-v7';
var NET_TIMEOUT = 2500;

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

/* Content-stable: renaming the file is how these ever change. */
function immutable(url) {
  return /\.(webp|png|svg)$/.test(url.pathname) ||
         url.pathname.indexOf('/vendor/') !== -1 ||
         url.hostname === 'fonts.gstatic.com';
}

function keep(req, res) {
  if (res && !res.redirected && (res.ok || res.type === 'opaque')) {
    var copy = res.clone();
    caches.open(VERSION).then(function (c) { c.put(req, copy); });
  }
  return res;
}

function cacheFirst(req) {
  return caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (res) { return keep(req, res); });
  });
}

function networkFirst(req) {
  var net = fetch(req).then(function (res) { return keep(req, res); });
  return caches.match(req).then(function (hit) {
    if (!hit) {
      // Nothing cached, so the network is the only option.
      return net.catch(function () {
        return req.mode === 'navigate' ? caches.match('./') : Response.error();
      });
    }
    // The fetch keeps running past the timeout, so the cache is fresh next time.
    return Promise.race([
      net.catch(function () { return hit; }),
      new Promise(function (r) { setTimeout(function () { r(hit); }, NET_TIMEOUT); })
    ]);
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;
  var isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;   // let the database socket alone

  e.respondWith(immutable(url) ? cacheFirst(req) : networkFirst(req));
});
