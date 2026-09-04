/* End-to-end check of the built site against a local server that mimics
 * Firebase Hosting's clean URLs.
 *
 * Runs in LOCAL sync mode (firebase-config.js has no databaseURL), which is
 * exactly the "all windows on one machine" rehearsal mode — so a draw on the
 * phone page must show up on the projector page.
 *
 *   node tools/verify-app.js [--shots <dir>]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { serve } = require('./static-server');

const PUBLIC = path.resolve(__dirname, '..', 'public');
const shotsAt = (() => {
  const i = process.argv.indexOf('--shots');
  return i > -1 ? process.argv[i + 1] : null;
})();

let failed = 0;
function check(label, ok, detail) {
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) failed++;
}

(async () => {
  const site = await serve(PUBLIC);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined
  });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

  const noise = [];
  const offsite = [];
  // The build sandbox has no route to Google Fonts. That is not a defect —
  // the pages are expected to fall back to system CJK faces — so it is
  // reported separately instead of failing the run.
  const isOffsite = url => /fonts\.(googleapis|gstatic)\.com/.test(url || '');

  function watch(p, tag) {
    p.on('console', m => {
      if (m.type() !== 'error') return;
      const where = m.location()?.url || '';
      (isOffsite(where) ? offsite : noise).push(`${tag} console: ${m.text()}`);
    });
    p.on('pageerror', e => noise.push(`${tag} pageerror: ${e.message}`));
    p.on('requestfailed', r => {
      if (/sw\.js|favicon/.test(r.url())) return;   // opportunistic precache
      const line = `${tag} requestfailed: ${r.url()} (${r.failure()?.errorText})`;
      (isOffsite(r.url()) ? offsite : noise).push(line);
    });
  }

  /* ── 大螢幕 ── */
  const screen = await ctx.newPage();
  watch(screen, 'screen');
  await screen.goto(site.origin + '/screen', { waitUntil: 'networkidle' });

  check('screen: 40 cells built',
    await screen.locator('.cell').count() === 40);
  check('screen: board is all 愁哥哥 at rest',
    await screen.locator('.cell.on').count() === 0);
  check('screen: sync picked local mode',
    /本機同步/.test(await screen.locator('#mode').textContent()),
    (await screen.locator('#mode').textContent()).trim());
  check('screen: stage scaled to viewport',
    await screen.evaluate(() =>
      getComputedStyle(document.getElementById('stage')).getPropertyValue('--scale').trim() === '1'));
  check('screen: board artwork loaded',
    await screen.evaluate(async () => {
      const url = getComputedStyle(document.querySelector('.face.front'))
        .backgroundImage.match(/url\("(.+?)"\)/)[1];
      const i = new Image(); i.src = url;
      return i.decode().then(() => i.naturalWidth > 0, () => false);
    }));
  check('screen: win overlay hidden', await screen.locator('#win').isHidden());

  /* ── 手機 ── */
  const phone = await ctx.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  watch(phone, 'play');
  await phone.goto(site.origin + '/play', { waitUntil: 'networkidle' });

  check('play: idle art shown before the first draw',
    await phone.locator('#idle').isVisible() && await phone.locator('#flash').isHidden());
  check('play: draw button reachable without scrolling',
    await phone.evaluate(() => {
      const b = document.getElementById('draw').getBoundingClientRect();
      return b.bottom <= window.innerHeight + 1 && b.top >= 0;
    }));
  check('play: no horizontal overflow',
    await phone.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth));

  /* ── a draw on the phone must reach the projector ── */
  await phone.locator('#draw').click();
  await phone.waitForTimeout(1100);            // 800ms roll, then settle

  check('play: draw number shown',
    /^\d+$/.test((await phone.locator('#flash-n').textContent()).trim()),
    (await phone.locator('#flash-n').textContent()).trim());

  await screen.waitForFunction(() => document.querySelectorAll('.cell.on').length > 0,
    null, { timeout: 5000 }).catch(() => {});
  const flipped = await screen.locator('.cell.on').count();
  check('screen: the phone\'s draw flipped the board', flipped > 0, `${flipped} cell(s) on`);
  check('screen: score matches flipped cells',
    (await screen.locator('#count').textContent()).trim() === String(flipped));
  check('screen: 剛剛抽到 filled in',
    (await screen.locator('#flash-name').textContent()).trim().length > 0,
    (await screen.locator('#flash-name').textContent()).trim());
  check('screen: log has a row',
    await screen.locator('.log-row').count() > 0);
  check('screen: timer counting on a flipped cell',
    /^\d:\d\d$/.test((await screen.locator('.cell.on .time').first().textContent()).trim()),
    (await screen.locator('.cell.on .time').first().textContent()).trim());

  /* ── the phone's timer sheet ── */
  await phone.locator('#open-sheet').click();
  await phone.waitForTimeout(300);
  check('play: sheet lists the live boxes',
    await phone.locator('.sheet-row').count() === flipped,
    `${await phone.locator('.sheet-row').count()} row(s)`);
  await phone.locator('#close-sheet').click();
  check('play: sheet closes', await phone.locator('#sheet').isHidden());

  /* ── reset is projector-only ── */
  check('play: no reset control on the phone',
    await phone.locator('text=重置全局').count() === 0);
  await screen.locator('#reset').click();
  check('screen: reset arms before it fires',
    (await screen.locator('#reset').textContent()).trim() === '再按一次確認' &&
    await screen.locator('.cell.on').count() > 0);
  await screen.locator('#reset').click();
  await screen.waitForTimeout(400);
  check('screen: second press clears the board',
    await screen.locator('.cell.on').count() === 0);
  check('screen: round advanced',
    /第 2 局/.test(await screen.locator('#mode').textContent()),
    (await screen.locator('#mode').textContent()).trim());

  /* ── 入口 ── */
  const land = await ctx.newPage();
  await land.setViewportSize({ width: 390, height: 844 });
  watch(land, 'index');
  await land.goto(site.origin + '/', { waitUntil: 'networkidle' });
  check('index: QR rendered',
    await land.evaluate(() => {
      const i = document.querySelector('.qr');
      return i.complete && i.naturalWidth > 0;
    }));
  check('index: phone URL printed',
    /\/play$/.test((await land.locator('#qr-url').textContent()).trim()),
    (await land.locator('#qr-url').textContent()).trim());
  check('index: both doors link out',
    await land.locator('a[href="play"]').count() === 1 &&
    await land.locator('a[href="screen"]').count() === 1);

  if (shotsAt) {
    fs.mkdirSync(shotsAt, { recursive: true });
    await screen.setViewportSize({ width: 1600, height: 900 });
    // Put a few boxes up so the screenshot shows the flipped state too.
    for (let i = 0; i < 3; i++) { await phone.locator('#draw').click(); await phone.waitForTimeout(950); }
    await screen.waitForTimeout(900);
    // Best-effort: the board never stops ticking, so a screenshot is a nice
    // to have and must not fail the run.
    const shot = async (p, file, opts) => {
      for (const animations of ['disabled', 'allow']) {
        try {
          await p.screenshot({
            path: path.join(shotsAt, file), animations, timeout: 15000, ...opts
          });
          return console.log(`  shot ${file}`);
        } catch (e) { /* the board never stops ticking; try the other mode */ }
      }
      console.log(`  shot ${file} skipped`);
    };
    console.log(`\nscreenshots → ${shotsAt}`);
    await shot(screen, 'screen.png');
    await shot(phone, 'play.png');
    await shot(land, 'index.png', { fullPage: true });
  }

  await browser.close();
  await site.close();

  if (offsite.length) {
    const hosts = [...new Set(offsite.map(l => l.match(/https:\/\/([^/]+)/)?.[1]).filter(Boolean))];
    console.log(`\nnote: ${hosts.join(', ')} unreachable from this sandbox; ` +
                'pages fell back to system fonts as designed.');
  }
  if (noise.length) {
    console.log('\nconsole / network errors:');
    [...new Set(noise)].forEach(n => console.log('  ' + n));
    failed += new Set(noise).size;
  }
  console.log(failed ? `\n${failed} problem(s).` : '\nAll checks passed.');
  process.exit(failed ? 1 : 0);
})();
