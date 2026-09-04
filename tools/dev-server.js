/* Serve public/ locally with the same clean URLs as Firebase Hosting.
 *
 *   node tools/dev-server.js [port]
 *
 * Useful for rehearsing before the camp: open /screen in one window and
 * /play in a few others. With firebase-config.js empty they all sync through
 * the local BroadcastChannel fallback. */
const path = require('path');
const os = require('os');
const { serve } = require('./static-server');

const PORT = Number(process.argv[2]) || 5000;
const PUBLIC = path.resolve(__dirname, '..', 'public');

serve(PUBLIC, { port: PORT }).then(site => {
  const lan = Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal)
    .map(i => i.address);
  console.log(`serving ${PUBLIC}`);
  console.log(`  入口     ${site.origin}/`);
  console.log(`  大螢幕   ${site.origin}/screen`);
  console.log(`  手機     ${site.origin}/play`);
  lan.forEach(ip => console.log(`  on wifi  http://${ip}:${PORT}/`));
  console.log('\nCtrl-C to stop.');
});
