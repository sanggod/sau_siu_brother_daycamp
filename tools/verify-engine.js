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
    // The wheel is the closed boxes plus a few open ones as decoys. Landing on
    // a decoy is a miss and must change nothing at all; landing anywhere else
    // must open a square. Anything that opens a square while reporting a miss,
    // or reports a hit on a square that was already open, is a bug.
    let drawsWithRoom = 0, misses = 0, lyingHits = 0, missChangedBoard = 0;

    for (let i = 0; i < DRAWS; i++) {
      // Look 50ms ahead so a box expiring between this snapshot and the
      // draw's own prune is not mistaken for a wasted pick.
      const before = st ? Object.keys(S.live(st, Date.now() + 50)).map(Number) : [];
      const beforeBoxes = st ? JSON.parse(JSON.stringify(st.boxes || {})) : {};
      S.draw();
      if (!st) return { fatal: 'no state after draw' };

      const last = st.last;
      if (before.length < 40 && last) {
        drawsWithRoom++;
        const landedOnOpen = before.indexOf(last.n) !== -1;
        if (last.eff === 'miss') {
          misses++;
          // A miss must leave every box exactly as it was, timers included.
          if (JSON.stringify(beforeBoxes) !== JSON.stringify(st.boxes || {})) missChangedBoard++;
        } else if (landedOnOpen) {
          lyingHits++;
        }
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

      // Keep the board cycling. 4000 back-to-back draws fill it to 40 within
      // the first 40 and hold it there, and a full board makes every draw a
      // miss — which starves the effect roll and is not a state the camp can
      // even reach, since the phone locks at 40.
      if (Object.keys(S.live(st, Date.now())).length >= 40) S.reset();

      // Let some boxes lapse now and then so expiry is exercised too.
      if (i % 250 === 249) await new Promise(r => setTimeout(r, 60));
    }

    return {
      seen, maxBoxes, wonSeen, wonWithoutFull, longLog,
      drawsWithRoom, misses, lyingHits, missChangedBoard,
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
  check('every non-miss draw opened a square that was closed',
    r.lyingHits === 0, `${r.lyingHits} draws claimed a hit on an open square`);
  check('a miss changed nothing on the board',
    r.missChangedBoard === 0, `${r.missChangedBoard} of ${r.misses} misses moved a box`);
  const missRate = r.drawsWithRoom ? r.misses / r.drawsWithRoom : 0;
  check('misses stay occasional, not the norm',
    r.misses > 0 && missRate < 0.2,
    `${r.misses}/${r.drawsWithRoom} = ${(missRate * 100).toFixed(1)}%`);

  const missing = r.effects.filter(id => !r.seen[id]);   // 'miss' is not rollable
  check('all 8 magic effects fired', missing.length === 0,
    missing.length ? 'never saw ' + missing.join(', ')
                   : r.effects.map(id => `${id}:${r.seen[id]}`).join('  '));

  await browser.close();
  await site.close();
  console.log(failed ? `\n${failed} problem(s).` : '\nDraw engine OK.');
  process.exit(failed ? 1 : 0);
})();
