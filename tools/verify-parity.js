/* Renders one board cell two ways in Chromium and compares them pixel by pixel:
 *
 *   A. the prototype's stack — sau.png / siu-m.png with background-blend-mode
 *      multiply over the face colour, then grayscale(1) contrast(1.03) or
 *      saturate(1.12)
 *   B. what ships — the baked sau.webp / siu.webp, no blend, no filter
 *
 * If these agree, tools/bake-assets.py reproduced the CSS maths correctly and
 * the projector no longer has to run 80 filtered compositing layers.
 *
 *   node tools/verify-parity.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { serve } = require('./static-server');

const ROOT = path.resolve(__dirname, '..');
const FRAME = path.join(__dirname, 'parity-frame.tmp.html');
let SRC, BAKED;   // filled in once the server has a port

// A cell as the board actually sizes it, at 4x so sampling error cannot hide
// a real difference.
const W = 454, H = 459;

const MEAN_LIMIT = 1.5;   // average channel drift — must stay near zero
const MAX_LIMIT = 10;     // worst single channel — WebP noise on hard edges

const faces = () => [
  {
    name: '愁哥哥 front',
    original: `background-image:url(${SRC}/sau.png);background-color:#D3D7E0;` +
              `background-blend-mode:multiply;filter:grayscale(1) contrast(1.03)`,
    baked: `background-image:url(${BAKED}/sau.webp)`
  },
  {
    name: '笑弟弟 back',
    original: `background-image:url(${SRC}/siu-m.png);background-color:#FFE07A;` +
              `background-blend-mode:multiply;filter:saturate(1.12)`,
    baked: `background-image:url(${BAKED}/siu.webp)`
  }
];

function page(css) {
  return `<!doctype html><meta charset="utf-8">
    <style>
      html,body{margin:0;background:#fff}
      #f{width:${W}px;height:${H}px;background-repeat:no-repeat;
         background-size:500% 800%;background-position:var(--bx) var(--by);${css}}
    </style>
    <div id="f"></div>`;
}

(async () => {
  // Served over http so the pages are same-origin with the artwork; file://
  // subresources are blocked once a page has no filesystem origin of its own.
  const site = await serve(ROOT, { cleanUrls: false });
  SRC = site.origin + '/project/assets';
  BAKED = site.origin + '/public/assets';

  const browser = await chromium.launch({
    // The sandbox ships a browser that may be newer than this Playwright pin.
    executablePath: process.env.CHROMIUM_PATH || undefined
  });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1
  });
  const p = await ctx.newPage();
  await p.goto(site.origin + '/tools/', { waitUntil: 'domcontentloaded' }).catch(() => {});

  let worst = 0, failures = 0;

  for (const face of faces()) {
    // Sample four slices spread across the sheet, not just one corner.
    for (const [c, r] of [[0, 0], [2, 3], [4, 7], [1, 5]]) {
      const shots = [];
      for (const css of [face.original, face.baked]) {
        // Written to a served file rather than setContent: a page whose
        // content is injected has no origin, and same-origin artwork then
        // silently fails to load.
        fs.writeFileSync(FRAME, page(css));
        await p.goto(site.origin + '/tools/' + path.basename(FRAME),
                     { waitUntil: 'load' });
        // Fail loudly if the artwork did not load: two blank frames would
        // otherwise compare as a clean, meaningless pass.
        const ok = await p.evaluate(([bx, by]) => {
          const el = document.getElementById('f');
          el.style.setProperty('--bx', bx);
          el.style.setProperty('--by', by);
          const url = getComputedStyle(el).backgroundImage.match(/url\("(.+?)"\)/)[1];
          const img = new Image();
          img.src = url;
          return img.decode().then(() => img.naturalWidth > 0, () => false);
        }, [`${c * 25}%`, `${r * 100 / 7}%`]);
        if (!ok) throw new Error('artwork failed to load for ' + face.name);
        shots.push(await p.screenshot());
      }

      const stats = await p.evaluate(async ([a, b, w, h]) => {
        const load = src => new Promise(res => {
          const i = new Image();
          i.onload = () => res(i);
          i.src = src;
        });
        const [ia, ib] = await Promise.all([a, b].map(load));
        const cv = new OffscreenCanvas(w, h);
        const cx = cv.getContext('2d', { willReadFrequently: true });
        cx.drawImage(ia, 0, 0);
        const da = cx.getImageData(0, 0, w, h).data;
        cx.clearRect(0, 0, w, h);
        cx.drawImage(ib, 0, 0);
        const db = cx.getImageData(0, 0, w, h).data;

        let max = 0, sum = 0, n = 0, over2 = 0;
        for (let i = 0; i < da.length; i += 4) {
          for (let k = 0; k < 3; k++) {
            const d = Math.abs(da[i + k] - db[i + k]);
            if (d > max) max = d;
            if (d > 2) over2++;
            sum += d; n++;
          }
        }
        return { max, mean: sum / n, over2, total: n };
      }, [
        'data:image/png;base64,' + shots[0].toString('base64'),
        'data:image/png;base64,' + shots[1].toString('base64'),
        W, H
      ]);

      worst = Math.max(worst, stats.max);
      const pct = (stats.over2 / stats.total * 100).toFixed(3);
      // Mean catches an error in the colour maths — a wrong matrix or blend
      // shifts every pixel. Max only catches a gross one, because isolated
      // few-level differences are just WebP quantisation on hard edges.
      const bad = stats.mean > MEAN_LIMIT || stats.max > MAX_LIMIT;
      if (bad) failures++;
      console.log(
        `${bad ? 'FAIL' : ' ok '}  ${face.name}  slice c${c}r${r}  ` +
        `max Δ ${String(stats.max).padStart(2)}  mean Δ ${stats.mean.toFixed(3)}  ` +
        `>2 on ${pct}% of channels`
      );
    }
  }

  await browser.close();
  await site.close();
  fs.rmSync(FRAME, { force: true });
  console.log(`\nworst channel difference across all slices: ${worst}/255`);
  if (failures) {
    console.log('PARITY FAILED — baked assets do not match the prototype.');
    process.exit(1);
  }
  console.log('Baked assets match the prototype\'s blend + filter output.');
})();
