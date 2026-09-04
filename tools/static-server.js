/* A static file server for the verification scripts.
 *
 * Mirrors Firebase Hosting's `cleanUrls`: /play serves play.html, and a
 * request for /play.html redirects to /play — so the local checks exercise
 * the same URLs the camp will.
 *
 * firebase-config.js is stubbed out with an empty databaseURL so the checks
 * always run in LOCAL sync mode. Without this they inherit whatever project
 * the repo is currently pointed at and play a full game into the live camp
 * database — which is exactly what happened before the stub existed. Pass
 * { localSync: false } if you ever genuinely want to test against Firebase. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

const LOCAL_CONFIG =
  '/* stubbed by tools/static-server.js — forces LOCAL sync mode */\n' +
  'export default { apiKey: "", authDomain: "", databaseURL: "", projectId: "",\n' +
  '  storageBucket: "", messagingSenderId: "", appId: "" };\n';

function serve(root, { cleanUrls = true, port = 0, host = '127.0.0.1', localSync = true } = {}) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname);

    if (localSync && rel === '/firebase-config.js') {
      res.writeHead(200, {
        'Content-Type': TYPES['.js'],
        'Cache-Control': 'no-store'
      });
      return res.end(LOCAL_CONFIG);
    }

    if (cleanUrls && rel.endsWith('.html')) {
      res.writeHead(301, { Location: rel.slice(0, -5) });
      return res.end();
    }

    let file = path.join(root, rel);
    if (rel.endsWith('/')) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      if (fs.existsSync(file + '.html')) file += '.html';
      else if (fs.existsSync(path.join(file, 'index.html'))) file = path.join(file, 'index.html');
    }

    // Never serve outside the root.
    if (!path.resolve(file).startsWith(path.resolve(root))) {
      res.writeHead(403);
      return res.end('forbidden');
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('not found');
    }

    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(file).pipe(res);
  });

  return new Promise(resolve => {
    server.listen(port, port ? undefined : host, () => {
      resolve({
        origin: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise(r => server.close(r))
      });
    });
  });
}

module.exports = { serve };
