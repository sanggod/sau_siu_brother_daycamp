/* Exercises the draw engine in sync.js — the magic effects, the win
 * condition, and the storage shape.
 *
 * The storage shape matters: Realtime Database turns an object whose keys are
 * integers into a sparse array, so boxes are keyed "b1".."b40". If that ever
 * regresses, the draw logic would start picking null holes out of the board.
 *
 *   node tools/verify-engine.js
 */
const { chromium } = require('playwright');
const path = require('path');
const { serve } = require('./static-server');

const PUBLIC = path.resolve(__dirname, '..', 'public');
const DRAWS = 4000;

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
  const p = await (await browser.newContext()).newPage();
  await p.goto(site.origin + '/play', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.FlipSync && window.FlipSync.mode !== 'booting');

  const r = await p.evaluate(async (DRAWS) => {
    const S = window.FlipSync;
    // Short timers so boxes actually expire during the run.
    S.configure({ min: 2, max: 4, magic: true });

    let st = null;
    S.onState(s => { st = s; });

    const seen = {};             // effect id -> times drawn
    const badKeys = new Set();
    let maxBoxes = 0, wonSeen = false, wonWithoutFull = false;
    let nullBox = false, outOfRange = false, longLog = false;
    let drawsWithN = 0;
    // The whole point of the closed-pool pick: while any box is still 愁哥哥,
    // a draw must land on one of those, never on a box that is already open.
    let wastedDraws = 0, drawsWithRoom = 0;

    for (let i = 0; i < DRAWS; i++) {
      // Look 50ms ahead so a box expiring between this snapshot and the
      // draw's own prune is not mistaken for a wasted pick.
      const before = st ? Object.keys(S.live(st, Date.now() + 50)).map(Number) : [];
      S.draw();
      if (!st) return { fatal: 'no state after draw' };

      const last = st.last;
      if (before.length < 40 && last) {
        drawsWithRoom++;
        if (before.indexOf(last.n) !== -1) wastedDraws++;
      }
      if (last) {
        seen[last.eff] = (seen[last.eff] || 0) + 1;
        if (last.n >= 1 && last.n <= 40) drawsWithN++;
      }

      const keys = Object.keys(st.boxes || {});
      for (const k of keys) {
        if (!/^b([1-9]|[1-3][0-9]|40)$/.test(k)) badKeys.add(k);
        const b = st.boxes[k];
        if (!b || typeof b.at !== 'number' || typeof b.dur !== 'number') nullBox = true;
        const n = +k.slice(1);
        if (!(n >= 1 && n <= 40)) outOfRange = true;
      }
      maxBoxes = Math.max(maxBoxes, keys.length);
      if ((st.draws || []).length > 10) longLog = true;

      const liveCount = Object.keys(S.live(st, Date.now())).length;
      if (st.wonAt) {
        wonSeen = true;
        if (liveCount < 40) wonWithoutFull = true;
      }

      // Let some boxes lapse now and then so expiry is exercised too.
      if (i % 250 === 249) await new Promise(r => setTimeout(r, 60));
    }

    return {
      seen, maxBoxes, wonSeen, wonWithoutFull, longLog, wastedDraws, drawsWithRoom,
      badKeys: [...badKeys], nullBox, outOfRange, drawsWithN,
      effects: S.EFFECTS.map(e => e.id)
    };
  }, DRAWS);

  if (r.fatal) {
    console.log('FAIL  ' + r.fatal);
    process.exit(1);
  }

  check(`every draw picked a box in 1–40 (${DRAWS} draws)`, r.drawsWithN === DRAWS);
  check('box keys are all "bN", never bare integers',
    r.badKeys.length === 0, r.badKeys.length ? r.badKeys.join(',') : 'no array coercion possible');
  check('no null or malformed box survived a draw', !r.nullBox);
  check('no box outside 1–40', !r.outOfRange);
  check('board never exceeded 40 boxes', r.maxBoxes <= 40, `peak ${r.maxBoxes}`);
  check('log stayed capped at 10', !r.longLog);
  check('win only ever set with all 40 live', !r.wonWithoutFull);
  check('win condition was reached at least once', r.wonSeen);
  check('a draw never lands on an already-open box while any is closed',
    r.wastedDraws === 0,
    `${r.wastedDraws} wasted of ${r.drawsWithRoom} draws with room`);

  const missing = r.effects.filter(id => !r.seen[id]);
  check('all 8 magic effects fired', missing.length === 0,
    missing.length ? 'never saw ' + missing.join(', ')
                   : r.effects.map(id => `${id}:${r.seen[id]}`).join('  '));

  await browser.close();
  await site.close();
  console.log(failed ? `\n${failed} problem(s).` : '\nDraw engine OK.');
  process.exit(failed ? 1 : 0);
})();
