/* 設定台 — the admin screen and the shared config it writes.
 *
 * The point of these checks is that a setting changed on /admin reaches the
 * DRAW, which runs on whichever phone pressed the button. A per-device setting
 * would pass a naive "the toggle flipped" test and still leave eight phones
 * disagreeing, so every assertion here changes something on the admin page and
 * then looks at what a *different* page actually rolls.
 *
 *   node tools/verify-admin.js
 */
const { chromium } = require('playwright');
const path = require('path');
const { serve } = require('./static-server');

const PUBLIC = path.resolve(__dirname, '..', 'public');
const BAD = ['gloom', 'half', 'regret'];

let failed = 0;
function check(label, ok, detail) {
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) failed++;
}

/* FlipSync.onState fires its callback synchronously before it returns the
   unsubscribe handle, so the handle cannot be used from inside the call. */
const readState = (page) => page.evaluate(() => {
  let s0 = null, off = null;
  off = window.FlipSync.onState(s => { s0 = s; });
  if (off) off();
  return JSON.parse(JSON.stringify(s0));
});

const settle = (page, ms = 350) => page.waitForTimeout(ms);

(async () => {
  const site = await serve(PUBLIC);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined
  });
  // One context so the local BroadcastChannel/localStorage sync links the
  // pages — the same path the Realtime Database takes at camp.
  const ctx = await browser.newContext();

  const admin = await ctx.newPage();
  await admin.setViewportSize({ width: 390, height: 844 });
  const errs = [];
  admin.on('pageerror', e => errs.push(e.message));
  await admin.goto(site.origin + '/admin', { waitUntil: 'networkidle' });
  await admin.waitForFunction(() => window.FlipSync && window.FlipSync.mode !== 'booting');

  const phone = await ctx.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(site.origin + '/play', { waitUntil: 'networkidle' });
  await phone.waitForFunction(() => window.FlipSync && window.FlipSync.mode !== 'booting');

  const screen = await ctx.newPage();
  await screen.goto(site.origin + '/screen', { waitUntil: 'networkidle' });
  await screen.waitForFunction(() => window.FlipSync && window.FlipSync.mode !== 'booting');

  check('admin: page built without script errors', errs.length === 0, errs.join(' | '));
  check('admin: 40 squares in the picker',
    await admin.locator('.pick-cell').count() === 40);
  check('admin: nothing overflows the card on a 390px phone',
    await admin.evaluate(() =>
      ![...document.querySelectorAll('.card *')]
        .some(e => e.getBoundingClientRect().right > window.innerWidth - 14)));

  /* ── 負面魔法 off must reach the roll on another page ── */
  await admin.locator('#t-negative').uncheck();
  await settle(admin);
  const cfgAfter = (await readState(phone)).cfg;
  check('admin: 負面魔法 off arrives at the phone',
    cfgAfter.negative === false, JSON.stringify(cfgAfter));

  const rolled = await phone.evaluate(() => {
    const S = window.FlipSync;
    const read = () => { let s0 = null, off = null; off = S.onState(s => { s0 = s; }); if (off) off(); return s0; };
    const seen = {};
    for (let i = 0; i < 400; i++) {
      S.draw();
      const st = read();
      if (st.last) seen[st.last.eff] = (seen[st.last.eff] || 0) + 1;
      if (Object.keys(S.live(st, Date.now())).length >= 40) S.reset();
    }
    return seen;
  });
  const badSeen = BAD.filter(id => rolled[id]);
  check('draw: no negative 魔法 rolled while it is off',
    badSeen.length === 0,
    badSeen.length ? badSeen.map(id => `${id}:${rolled[id]}`).join(' ')
                   : Object.keys(rolled).join(' '));
  check('draw: the good 魔法 still roll', !!(rolled.spread || rolled.triple || rolled.row));

  /* ── 食白果 off ── */
  await admin.locator('#t-miss').uncheck();
  await settle(admin);
  const missRolled = await phone.evaluate(() => {
    const S = window.FlipSync;
    const read = () => { let s0 = null, off = null; off = S.onState(s => { s0 = s; }); if (off) off(); return s0; };
    let misses = 0;
    for (let i = 0; i < 400; i++) {
      S.draw();
      const st = read();
      if (st.last && st.last.eff === 'miss') misses++;
      // Stop short of a full board: with nothing closed every draw is a miss
      // by definition, which is not what this check is about.
      if (Object.keys(S.live(st, Date.now())).length >= 38) S.reset();
    }
    return misses;
  });
  check('draw: 食白果 stops happening once it is off', missRolled === 0, `${missRolled} misses`);

  /* ── longer countdowns ── */
  await admin.locator('#t-negative').check();
  await admin.locator('#t-miss').check();
  await admin.locator('[data-dur="300,480"]').click();
  await settle(admin);
  const durCfg = (await readState(screen)).cfg;
  check('admin: 好耐 preset reaches the projector',
    durCfg.min === 300 && durCfg.max === 480, `${durCfg.min}-${durCfg.max}`);

  /* Magic off for the measurement: 笑到停唔到 doubles a box and 笑得唔夠久
     halves two of them, so with effects live a duration outside the window is
     correct behaviour and says nothing about whether the window arrived. */
  await admin.locator('#t-magic').uncheck();
  await settle(admin);
  const durs = await phone.evaluate(() => {
    const S = window.FlipSync;
    const read = () => { let s0 = null, off = null; off = S.onState(s => { s0 = s; }); if (off) off(); return s0; };
    S.reset();
    const out = [];
    for (let i = 0; i < 40; i++) {
      S.draw();
      const st = read();
      for (const k in st.boxes) out.push(st.boxes[k].dur);
      if (Object.keys(S.live(st, Date.now())).length >= 40) break;
    }
    return out;
  });
  const inRange = durs.every(d => d >= 300000 && d <= 480000);
  check('draw: every new box uses the longer window',
    durs.length > 0 && inRange,
    `${durs.length} boxes, ${Math.min(...durs) / 1000}s–${Math.max(...durs) / 1000}s`);
  await admin.locator('#t-magic').check();
  await settle(admin);

  /* ── 指定下一格 ── */
  await admin.locator('[data-dur="120,180"]').click();
  await settle(admin);
  await phone.evaluate(() => window.FlipSync.reset());
  await settle(admin);

  await admin.locator('.pick-cell[data-n="27"]').click();
  await settle(admin);
  check('admin: the forced square shows on the panel',
    await admin.locator('#forced').isVisible() &&
    /27/.test(await admin.locator('#forced-text').textContent()),
    (await admin.locator('#forced-text').textContent()).trim());
  check('admin: the forced square is marked on the picker',
    await admin.locator('.pick-cell.picked[data-n="27"]').count() === 1);

  await phone.evaluate(() => window.FlipSync.draw());
  await settle(phone);
  const afterForce = await readState(phone);
  check('draw: the forced square is what came up',
    afterForce.last && afterForce.last.n === 27, `n=${afterForce.last && afterForce.last.n}`);
  check('draw: the force is spent after one draw', !afterForce.forced);
  check('admin: the panel clears once it is spent',
    await admin.locator('#forced').isHidden());

  /* a forced square that is already laughing still opens */
  await admin.locator('.pick-cell[data-n="27"]').click();
  await settle(admin);
  await phone.evaluate(() => window.FlipSync.draw());
  await settle(phone);
  const reForce = await readState(phone);
  check('draw: forcing an already-open square is not treated as a miss',
    reForce.last && reForce.last.n === 27 && reForce.last.eff !== 'miss',
    `n=${reForce.last && reForce.last.n} eff=${reForce.last && reForce.last.eff}`);

  /* forcing an effect too */
  await admin.selectOption('#force-eff', 'row');
  await admin.locator('.pick-cell[data-n="3"]').click();
  await settle(admin);
  await phone.evaluate(() => window.FlipSync.draw());
  await settle(phone);
  const effForce = await readState(phone);
  check('draw: a forced effect is what fired',
    effForce.last && effForce.last.n === 3 && effForce.last.eff === 'row',
    `n=${effForce.last && effForce.last.n} eff=${effForce.last && effForce.last.eff}`);

  /* cancelling */
  await admin.selectOption('#force-eff', '');
  await admin.locator('.pick-cell[data-n="11"]').click();
  await settle(admin);
  await admin.locator('#forced-clear').click();
  await settle(admin);
  check('admin: 取消 drops the forced square',
    !(await readState(phone)).forced &&
    await admin.locator('#forced').isHidden());

  /* ── 大螢幕倒數 ── */
  await admin.locator('#t-timers').uncheck();
  await settle(screen, 500);
  check('screen: countdowns come off the board when switched off',
    await screen.evaluate(() => document.body.classList.contains('no-timers')));
  await admin.locator('#t-timers').check();
  await settle(screen, 500);
  check('screen: and come back',
    await screen.evaluate(() => !document.body.classList.contains('no-timers')));

  /* ── settings must survive 重新開始 ── */
  await admin.locator('[data-mood="kind"]').click();
  await settle(admin);
  const beforeReset = (await readState(admin)).cfg;
  await admin.locator('#reset').click();      // arms
  await admin.locator('#reset').click();      // fires
  await settle(admin, 600);
  const afterReset = await readState(admin);
  check('admin: 順風 preset switches the negatives off',
    beforeReset.negative === false && beforeReset.miss === false);
  check('admin: settings survive 重新開始',
    afterReset.cfg.negative === false && afterReset.cfg.miss === false,
    JSON.stringify(afterReset.cfg));
  check('admin: 重新開始 still cleared the board and bumped the round',
    Object.keys(afterReset.boxes).length === 0 && afterReset.round > 1,
    `round ${afterReset.round}`);

  await browser.close();
  await site.close();
  console.log(failed ? `\n${failed} problem(s).` : '\n設定台 OK.');
  process.exit(failed ? 1 : 0);
})();
